import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { getEscopo } from '@/lib/escopo'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function getMe(authUserId: string) {
  const { data } = await supabaseAdmin.from('usuarios').select('id, role, empresa_id, equipe_id').eq('auth_user_id', authUserId).single()
  return data
}

// GET: lista vendas com comissões + config padrão
export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )
    const { data: { user: authUser } } = await supabaseUser.auth.getUser()
    if (!authUser) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    const me = await getMe(authUser.id)
    if (!me) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 })

    // só master e representante veem comissões
    if (!['master', 'representante'].includes(me.role)) {
      return NextResponse.json({ error: "Sem permissão", sem_acesso: true }, { status: 403 })
    }

    // config padrão da empresa
    const empresaId = me.role === 'master' ? null : me.empresa_id
    let configQuery = supabaseAdmin.from('comissao_config').select('*')
    if (empresaId) configQuery = configQuery.eq('empresa_id', empresaId)
    const { data: configs } = await configQuery
    const config = configs?.[0] || null

    // config por categoria
    let catQuery = supabaseAdmin.from('comissao_config_categoria').select('*')
    if (empresaId) catQuery = catQuery.eq('empresa_id', empresaId)
    const { data: configCategorias } = await catQuery

    // vendas com dados de comissão + plano + estorno
    let q = supabaseAdmin
      .from('vendas')
      .select('id, valor_credito, numero_contrato, numero_proposta, empresa_id, equipe_id, vendedor_id, comissao_vendedor_percent, comissao_supervisor_percent, comissao_recebida_rs, comissao_recebida_percent, criado_em, data_venda, clientes(nome), usuarios:vendedor_id(nome, role), planos(sigla, comissao_total, comissao_parcelas, estorno_percent, estorno_ate_pgto, categoria_comissao, adesao_percent, bem), boletos(qtd_parcelas, status, data_efetivacao)')
      .order('criado_em', { ascending: false })

    const { escopoGlobal } = await getEscopo(me)
    if (!escopoGlobal) q = q.eq('empresa_id', me.empresa_id)
    const { data: vendas } = await q

    // === Pagamento dos mapas: Embracon paga na SEXTA da semana seguinte ao encerramento, 18h ===
    const dataPagamentoMapa = (dataEnc: string): Date => {
      const d = new Date(dataEnc + 'T00:00:00')
      const dow = d.getDay() === 0 ? 7 : d.getDay() // dom=7
      const proxSegunda = new Date(d); proxSegunda.setDate(d.getDate() + (8 - dow))
      const sexta = new Date(proxSegunda); sexta.setDate(proxSegunda.getDate() + 4)
      sexta.setHours(18, 0, 0, 0)
      return sexta
    }
    const agora = new Date()
    const { data: mapasAll } = await supabaseAdmin.from('mapas_comissao').select('id, data_encerramento')
    let linhasAll: any[] = []
    {
      let from = 0
      const PAGE = 1000
      while (true) {
        const { data: pg } = await supabaseAdmin.from('mapa_linhas')
          .select('mapa_id, contrato, valor_comissao')
          .order('id', { ascending: true })
          .range(from, from + PAGE - 1)
        linhasAll = linhasAll.concat(pg || [])
        if (!pg || pg.length < PAGE) break
        from += PAGE
      }
    }
    const mapaPago = new Map<string, boolean>()
    const mapaDataPag = new Map<string, Date>()
    for (const mp of (mapasAll || []) as any[]) {
      if (!mp.data_encerramento) { mapaPago.set(mp.id, true); continue }
      const dp = dataPagamentoMapa(mp.data_encerramento)
      mapaDataPag.set(mp.id, dp)
      mapaPago.set(mp.id, agora >= dp)
    }
    // por contrato: recebido pago, mapeado total, e a receber separado por data
    const recebidoPagoPorContrato = new Map<string, number>()
    const mapeadoTotalPorContrato = new Map<string, number>()
    const aReceberPorContrato = new Map<string, number>()
    for (const l of (linhasAll || []) as any[]) {
      const c = String(l.contrato).trim()
      const val = l.valor_comissao || 0
      mapeadoTotalPorContrato.set(c, (mapeadoTotalPorContrato.get(c) || 0) + val)
      if (mapaPago.get(l.mapa_id)) recebidoPagoPorContrato.set(c, (recebidoPagoPorContrato.get(c) || 0) + val)
      else aReceberPorContrato.set(c, (aReceberPorContrato.get(c) || 0) + val)
    }
    let proximaSextaPagamento: Date | null = null
    for (const [id, dp] of mapaDataPag) {
      if (!mapaPago.get(id) && (!proximaSextaPagamento || dp < proximaSextaPagamento)) proximaSextaPagamento = dp
    }
    // fila de pagamentos pendentes agrupada por data (para o card Próximo Pagamento)
    const filaPorData = new Map<string, number>() // 'ISO' -> total do mapa
    for (const mp of (mapasAll || []) as any[]) {
      if (mapaPago.get(mp.id)) continue
      const dp = mapaDataPag.get(mp.id); if (!dp) continue
      const totalMapa = (linhasAll || []).filter((l: any) => l.mapa_id === mp.id).reduce((s: number, l: any) => s + (l.valor_comissao || 0), 0)
      filaPorData.set(dp.toISOString(), (filaPorData.get(dp.toISOString()) || 0) + totalMapa)
    }
    const filaPagamentos = Array.from(filaPorData.entries()).map(([data, total]) => ({ data, total })).sort((a, b) => a.data.localeCompare(b.data))

    // períodos de produção configurados
    const { data: producoes } = await supabaseAdmin.from('producoes').select('*').order('data_inicio', { ascending: false })

    // a receber POR DATA de pagamento, por contrato
    const aReceberPorContratoData = new Map<string, Record<string, number>>()
    for (const l of (linhasAll || []) as any[]) {
      if (mapaPago.get(l.mapa_id)) continue
      const dp = mapaDataPag.get(l.mapa_id); if (!dp) continue
      const c = String(l.contrato).trim()
      const obj = aReceberPorContratoData.get(c) || {}
      obj[dp.toISOString()] = (obj[dp.toISOString()] || 0) + (l.valor_comissao || 0)
      aReceberPorContratoData.set(c, obj)
    }

    const lista = (vendas || []).map((v: any) => {
      const plano = Array.isArray(v.planos) ? v.planos[0] : v.planos
      const cliente = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes
      const vendedor = Array.isArray(v.usuarios) ? v.usuarios[0] : v.usuarios
      const boleto = Array.isArray(v.boletos) ? v.boletos[0] : v.boletos
      const credito = v.valor_credito || 0
      const comLRTotal = plano?.comissao_total ? credito * (plano.comissao_total / 100) : 0
      // comissão GARANTIDA: proporcional às parcelas já pagas pelo cliente
      const parcelasComissao: number[] = Array.isArray(plano?.comissao_parcelas) ? plano.comissao_parcelas : []
      const somaPesos = parcelasComissao.reduce((s: number, x: number) => s + x, 0) || 1
      const parcelasPagas = 1 + (boleto?.qtd_parcelas || 0) // 1ª parcela + boleto único
      const pesoPago = parcelasComissao.slice(0, Math.min(parcelasPagas, parcelasComissao.length)).reduce((s: number, x: number) => s + x, 0)
      const comLR = comLRTotal * (pesoPago / somaPesos) // comissão garantida (vencida)
      // precedência: % individual da venda > padrão da categoria do plano > 0
      const catPlano = plano?.categoria_comissao
      // pega a config da categoria DA EMPRESA da venda (pro master ver a comissão certa de cada representação)
      const cfgCat = (configCategorias || []).find((cc: any) => cc.categoria === catPlano && (cc.empresa_id === v.empresa_id || cc.empresa_id === null))
        || (configCategorias || []).find((cc: any) => cc.categoria === catPlano)
      const vendedorObj = Array.isArray(v.usuarios) ? v.usuarios[0] : v.usuarios
      const vendaPropriaSupervisor = vendedorObj?.role === 'supervisor'
      let pVend: number, pSup: number
      if (vendaPropriaSupervisor) {
        pVend = v.comissao_vendedor_percent ?? cfgCat?.percentual_supervisor_proprio ?? 0
        pSup = 0
      } else {
        pVend = v.comissao_vendedor_percent ?? cfgCat?.percentual_vendedor ?? 0
        pSup = v.comissao_supervisor_percent ?? cfgCat?.percentual_supervisor ?? 0
      }
      const comVend = credito * (pVend / 100)
      const comSup = credito * (pSup / 100)
      // risco de estorno
      const qtdParc = boleto?.qtd_parcelas || 0
      const pgtosCobertos = 1 + qtdParc
      // Parcelinha (imovel_parcelinha) NÃO tem estorno: estorno_ate_pgto é null e nunca está em risco
      const semEstorno = plano?.categoria_comissao === 'imovel_parcelinha' || plano?.estorno_ate_pgto == null
      const pgtoSeg = plano?.estorno_ate_pgto || 8
      const emRisco = semEstorno ? false : pgtosCobertos < pgtoSeg
      const estorno = semEstorno ? 0 : (plano?.estorno_percent ? credito * (plano.estorno_percent / 100) : 0)
      return {
        id: v.id, criado_em: v.criado_em, data_venda: v.data_venda || v.criado_em, empresa_id: v.empresa_id, equipe_id: v.equipe_id, vendedor_id: v.vendedor_id, cliente: cliente?.nome || '-', vendedor: vendedor?.nome || '-',
        plano: plano?.sigla || '-', adesao: plano?.adesao_percent ?? null, bem: plano?.bem || '-', credito,
        comissao_lr: comLR, comissao_lr_total: comLRTotal, parcelas_pagas: parcelasPagas, total_parcelas_comissao: parcelasComissao.length,
        percentual_vendedor: pVend, comissao_vendedor: comVend,
        percentual_supervisor: pSup, comissao_supervisor: comSup,
        venda_propria_supervisor: vendaPropriaSupervisor,
        comissao_supervisor_propria: vendaPropriaSupervisor ? comVend : 0,
        comissao_recebida_rs: (recebidoPagoPorContrato.get(String(v.numero_contrato || '').trim()) || recebidoPagoPorContrato.get(String(v.numero_proposta || '').trim()) || 0),
        comissao_a_receber_rs: (aReceberPorContrato.get(String(v.numero_contrato || '').trim()) || aReceberPorContrato.get(String(v.numero_proposta || '').trim()) || 0),
        a_receber_por_data: (aReceberPorContratoData.get(String(v.numero_contrato || '').trim()) || aReceberPorContratoData.get(String(v.numero_proposta || '').trim()) || {}),
        comissao_mapeada_rs: (mapeadoTotalPorContrato.get(String(v.numero_contrato || '').trim()) || mapeadoTotalPorContrato.get(String(v.numero_proposta || '').trim()) || 0),
        comissao_recebida_percent: v.comissao_recebida_percent || 0,
        boleto_status: boleto?.status || null,
        boleto_data_efetivado: boleto?.data_efetivacao || null,
        em_risco: emRisco, valor_estorno: estorno, faltam: emRisco ? pgtoSeg - pgtosCobertos : 0, pgto_seguranca: pgtoSeg,
      }
    })

    // Opções de filtro conforme o role
    let empresasOpc: any[] = [], equipesOpc: any[] = [], vendedoresOpc: any[] = []
    if (me.role === 'master') {
      const { data: emp } = await supabaseAdmin.from('empresas').select('id, nome').order('nome')
      empresasOpc = emp || []
      const { data: eq } = await supabaseAdmin.from('equipes').select('id, nome, empresa_id').order('nome')
      equipesOpc = eq || []
      const { data: vd } = await supabaseAdmin.from('usuarios').select('id, nome, empresa_id, equipe_id').in('role', ['vendedor', 'supervisor']).order('nome')
      vendedoresOpc = vd || []
    } else if (['representante', 'adm'].includes(me.role)) {
      const { data: eq } = await supabaseAdmin.from('equipes').select('id, nome, empresa_id').eq('empresa_id', me.empresa_id).order('nome')
      equipesOpc = eq || []
      const { data: vd } = await supabaseAdmin.from('usuarios').select('id, nome, empresa_id, equipe_id').in('role', ['vendedor', 'supervisor']).eq('empresa_id', me.empresa_id).order('nome')
      vendedoresOpc = vd || []
    } else if (me.role === 'supervisor') {
      const { data: vd } = await supabaseAdmin.from('usuarios').select('id, nome, empresa_id, equipe_id').in('role', ['vendedor', 'supervisor']).eq('equipe_id', me.equipe_id).order('nome')
      vendedoresOpc = vd || []
    }

    return NextResponse.json({
      vendas: lista, config, config_categorias: configCategorias || [], meu_role: me.role,
      filtros: { empresas: empresasOpc, equipes: equipesOpc, vendedores: vendedoresOpc },
      proxima_sexta_pagamento: proximaSextaPagamento ? proximaSextaPagamento.toISOString() : null,
      fila_pagamentos: filaPagamentos,
      producoes: producoes || [],
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST: aplica % (individual ou lote) ou salva config padrão
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )
    const { data: { user: authUser } } = await supabaseUser.auth.getUser()
    if (!authUser) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    const me = await getMe(authUser.id)
    if (!me || !['master', 'representante'].includes(me.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }

    const body = await req.json()

    // criar período de produção (só master)
    if (body.acao === 'criar_producao') {
      if (me.role !== 'master') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
      const { error } = await supabaseAdmin.from('producoes').insert({ nome: body.nome, data_inicio: body.data_inicio, data_fim: body.data_fim })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    // salvar config padrão
    if (body.acao === 'salvar_config') {
      const empresaId = body.empresa_id || me.empresa_id
      await supabaseAdmin.from('comissao_config').upsert({
        empresa_id: empresaId,
        percentual_vendedor_padrao: body.percentual_vendedor_padrao || 0,
        percentual_supervisor_padrao: body.percentual_supervisor_padrao || 0,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'empresa_id' })
      return NextResponse.json({ success: true })
    }

    // salvar config por categoria
    if (body.acao === 'salvar_config_categoria') {
      const empresaId = body.empresa_id || me.empresa_id
      const cats = body.categorias || []
      for (const c of cats) {
        await supabaseAdmin.from('comissao_config_categoria').upsert({
          empresa_id: empresaId,
          categoria: c.categoria,
          percentual_vendedor: c.percentual_vendedor || 0,
          percentual_supervisor: c.percentual_supervisor || 0,
          percentual_supervisor_proprio: c.percentual_supervisor_proprio || 0,
          atualizado_em: new Date().toISOString(),
        }, { onConflict: 'empresa_id,categoria' })
      }
      return NextResponse.json({ success: true })
    }

    // aplicar % nas vendas (lote ou individual)
    if (body.acao === 'aplicar') {
      const { venda_ids, percentual_vendedor, percentual_supervisor, percentual_supervisor_proprio } = body
      if (!Array.isArray(venda_ids) || venda_ids.length === 0) return NextResponse.json({ error: "Nenhuma venda selecionada" }, { status: 400 })
      const update: any = {}
      const parsePct = (x: any) => parseFloat(String(x).replace(',', '.'))
      if (percentual_vendedor !== undefined && percentual_vendedor !== null && percentual_vendedor !== '') update.comissao_vendedor_percent = parsePct(percentual_vendedor)
      if (percentual_supervisor !== undefined && percentual_supervisor !== null && percentual_supervisor !== '') update.comissao_supervisor_percent = parsePct(percentual_supervisor)
      // supervisor próprio: salvo no comissao_vendedor_percent (usado quando o vendedor é supervisor)
      if (percentual_supervisor_proprio !== undefined && percentual_supervisor_proprio !== null && percentual_supervisor_proprio !== '') update.comissao_vendedor_percent = parsePct(percentual_supervisor_proprio)
      if (Object.keys(update).length === 0) return NextResponse.json({ error: "Informe ao menos um percentual" }, { status: 400 })
      await supabaseAdmin.from('vendas').update(update).in('id', venda_ids)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
