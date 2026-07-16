import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function getMe(authUserId: string) {
  const { data } = await supabaseAdmin.from('usuarios').select('id, role, empresa_id, equipe_id').eq('auth_user_id', authUserId).single()
  return data
}

async function autenticar() {
  const cookieStore = await cookies()
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user: authUser } } = await supabaseUser.auth.getUser()
  if (!authUser) return null
  return await getMe(authUser.id)
}

// GET: visão exclusiva do master — comissão de 0,25% dividida em 8 parcelas
export async function GET() {
  try {
    const me = await autenticar()
    // trava de segurança: 404 (não revela que a rota existe) para qualquer role != master
    if (!me || me.role !== 'master') return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

    // 1. Vendas do sistema (para cruzar contrato → cliente/empresa/crédito). Contratos SEM venda ficam de fora.
    const { data: vendas } = await supabaseAdmin
      .from('vendas')
      .select('id, valor_credito, numero_contrato, numero_proposta, empresa_id, clientes(nome), empresas(nome)')
    const contratoToVenda = new Map<string, any>()
    for (const v of (vendas || []) as any[]) {
      const cliente = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes
      const empresa = Array.isArray(v.empresas) ? v.empresas[0] : v.empresas
      const info = {
        venda_id: v.id, credito_venda: v.valor_credito || 0, empresa_id: v.empresa_id,
        cliente: cliente?.nome || '-', empresa: empresa?.nome || '-',
      }
      const c1 = String(v.numero_contrato || '').trim()
      const c2 = String(v.numero_proposta || '').trim()
      if (c1) contratoToVenda.set(c1, info)
      if (c2) contratoToVenda.set(c2, info)
    }

    // 2. Mapas (data de encerramento por mapa)
    const { data: mapasAll } = await supabaseAdmin.from('mapas_comissao').select('id, data_encerramento')
    const mapaData = new Map<string, string | null>()
    for (const mp of (mapasAll || []) as any[]) mapaData.set(mp.id, mp.data_encerramento || null)

    // 3. Linhas dos borderôs — PAGINADO em blocos de 1000 (tabela passa de 1.200 linhas)
    let linhasAll: any[] = []
    {
      let from = 0
      const PAGE = 1000
      while (true) {
        const { data: pg } = await supabaseAdmin.from('mapa_linhas')
          .select('contrato, valor_comissao, calc_comis, mapa_id, parcela_de, parcela_ate')
          .gte('valor_comissao', 0)
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1)
        linhasAll = linhasAll.concat(pg || [])
        if (!pg || pg.length < PAGE) break
        from += PAGE
      }
    }

    // 4. Boletos efetivados → parcelas que o cliente já pagou (por venda)
    const { data: boletosEf } = await supabaseAdmin.from('boletos').select('venda_id, qtd_parcelas').eq('status', 'efetivado')
    const qtdEfetivadoPorVenda = new Map<string, number>()
    for (const b of (boletosEf || []) as any[]) {
      if (!b.venda_id) continue
      const atual = qtdEfetivadoPorVenda.get(b.venda_id) || 0
      qtdEfetivadoPorVenda.set(b.venda_id, Math.max(atual, b.qtd_parcelas || 0))
    }

    // 5. Monta por contrato NOSSO: crédito e parcelas vindas.
    //    Cada linha do borderô pode representar um INTERVALO (ex.: "5-8" = parcelas 5,6,7,8).
    //    Expandimos o intervalo, deduplicamos por número da parcela (Set por contrato,
    //    mantendo a data do PRIMEIRO borderô em que veio) e limitamos a 8 parcelas.
    const contratos = new Map<string, { contrato: string; venda: any; maxCalc: number; parcelasMap: Map<number, string | null> }>()
    for (const l of linhasAll as any[]) {
      const c = String(l.contrato || '').trim()
      if (!c) continue
      const venda = contratoToVenda.get(c)
      if (!venda) continue // contrato sem venda no sistema (antigo/pré-parceria) → não é devido
      const key = venda.venda_id // chaveia por venda (contrato e proposta podem apontar pra mesma venda)
      if (!contratos.has(key)) contratos.set(key, { contrato: c, venda, maxCalc: 0, parcelasMap: new Map() })
      const item = contratos.get(key)!
      item.maxCalc = Math.max(item.maxCalc, l.calc_comis || 0)
      // ignora linhas cujo início já passa de 8 (são ajustes, não parcelas do acordo)
      if ((l.parcela_de || 1) > 8) continue
      const de = Math.max(1, Math.min(8, l.parcela_de || 1))
      const ate = Math.max(de, Math.min(8, l.parcela_ate || de))
      const data = mapaData.get(l.mapa_id) || null
      for (let n = de; n <= ate; n++) {
        if (!item.parcelasMap.has(n)) item.parcelasMap.set(n, data) // 1ª vez vence: mantém a data do primeiro borderô
      }
    }

    // 6. Expande em parcelas com valor_devido = credito * 0,25% / 8; crédito = venda (real) ou maior calc_comis
    type Parcela = { contrato: string; venda_id: string; valor: number; data: string | null; status?: 'recebida' | 'pendente' }
    const parcelasFlat: Parcela[] = []
    const infoVenda = new Map<string, { contrato: string; credito: number; valorParcela: number; venda: any }>()
    for (const [vid, item] of contratos) {
      const credito = item.venda.credito_venda > 0 ? item.venda.credito_venda : item.maxCalc
      const valorParcela = (credito * 0.0025) / 8
      infoVenda.set(vid, { contrato: item.contrato, credito, valorParcela, venda: item.venda })
      for (const [, data] of item.parcelasMap) parcelasFlat.push({ contrato: item.contrato, venda_id: vid, valor: valorParcela, data })
    }

    // 7. Recebimentos lançados → total e alocação FIFO por data do borderô
    const { data: recebimentos } = await supabaseAdmin.from('master_recebimentos').select('*').order('data_pagamento', { ascending: true })
    const totalRecebido = (recebimentos || []).reduce((s: number, r: any) => s + (r.valor || 0), 0)

    const parcelasOrdenadas = [...parcelasFlat].sort((a, b) => {
      const da = a.data || '9999-12-31', db = b.data || '9999-12-31'
      if (da !== db) return da.localeCompare(db)
      return a.contrato.localeCompare(b.contrato)
    })
    let restante = totalRecebido
    let esgotou = false
    for (const p of parcelasOrdenadas) {
      if (!esgotou && restante + 0.01 >= p.valor) { p.status = 'recebida'; restante -= p.valor }
      else { p.status = 'pendente'; esgotou = true }
    }

    // 8. Agrega o que veio no borderô por venda_id (parcelas vindas / recebidas / pendentes via FIFO)
    const porVenda = new Map<string, any>()
    for (const p of parcelasOrdenadas) {
      if (!porVenda.has(p.venda_id)) porVenda.set(p.venda_id, { parcelas_vindas: 0, parcelas_recebidas: 0, parcelas_pendentes: 0 })
      const agg = porVenda.get(p.venda_id)
      agg.parcelas_vindas += 1
      if (p.status === 'recebida') agg.parcelas_recebidas += 1
      else agg.parcelas_pendentes += 1
    }

    // 9. Base = TODAS as vendas com contrato ou proposta (mesmo sem boleto/borderô: garantem a 1ª parcela)
    const vendasOut = (vendas || [])
      .filter((v: any) => String(v.numero_contrato || '').trim() || String(v.numero_proposta || '').trim())
      .map((v: any) => {
        const cliente = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes
        const empresa = Array.isArray(v.empresas) ? v.empresas[0] : v.empresas
        const info = infoVenda.get(v.id)           // dados do borderô (se veio)
        const agg = porVenda.get(v.id) || { parcelas_vindas: 0, parcelas_recebidas: 0, parcelas_pendentes: 0 }
        // crédito: da própria venda; cai pro maior calc_comis do borderô só se a venda não tiver crédito
        const credito = (v.valor_credito || 0) > 0 ? (v.valor_credito || 0) : (info?.credito || 0)
        const valorParcela = (credito * 0.0025) / 8
        const qtdEf = qtdEfetivadoPorVenda.get(v.id) || 0
        const parcelasGarantidas = Math.min(8, 1 + qtdEf) // 1ª parcela sempre + parcelas do boleto único efetivado, cap 8
        const valorAVencer = Math.max(0, parcelasGarantidas - agg.parcelas_vindas) * valorParcela
        return {
          contrato: info?.contrato || String(v.numero_contrato || v.numero_proposta || '').trim(),
          cliente: cliente?.nome || '-', empresa: empresa?.nome || '-', empresa_id: v.empresa_id,
          credito,
          parcelas_vindas: agg.parcelas_vindas,
          valor_devido_venda: agg.parcelas_vindas * valorParcela,
          parcelas_recebidas: agg.parcelas_recebidas,
          parcelas_pendentes: agg.parcelas_pendentes,
          valor_pendente: agg.parcelas_pendentes * valorParcela,
          parcelas_garantidas: parcelasGarantidas,
          valor_a_vencer: valorAVencer,
        }
      })

    const devido_total = vendasOut.reduce((s, v) => s + v.valor_devido_venda, 0)
    const a_receber = vendasOut.reduce((s, v) => s + v.valor_pendente, 0)
    const a_vencer_garantido = vendasOut.reduce((s, v) => s + v.valor_a_vencer, 0)

    return NextResponse.json({
      cards: { devido_total, recebido_total: totalRecebido, a_receber, a_vencer_garantido },
      vendas: vendasOut,
      recebimentos: recebimentos || [],
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST: lançar / excluir recebimento do master (mesma trava de role)
export async function POST(req: NextRequest) {
  try {
    const me = await autenticar()
    if (!me || me.role !== 'master') return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

    const body = await req.json()

    if (body.acao === 'lancar') {
      if (!body.data_pagamento || body.valor == null) return NextResponse.json({ error: 'Informe data e valor' }, { status: 400 })
      const { error } = await supabaseAdmin.from('master_recebimentos').insert({
        data_pagamento: body.data_pagamento,
        valor: Number(body.valor),
        observacao: body.observacao || null,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    if (body.acao === 'excluir') {
      if (!body.id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })
      const { error } = await supabaseAdmin.from('master_recebimentos').delete().eq('id', body.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
