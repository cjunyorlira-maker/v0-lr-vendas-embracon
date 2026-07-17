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

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )
    const { data: { user: authUser } } = await supabaseUser.auth.getUser()
    if (!authUser) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    const { data: me } = await supabaseAdmin.from('usuarios').select('id, role, empresa_id').eq('auth_user_id', authUser.id).single()
    if (!me || !['master', 'representante', 'adm'].includes(me.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 })

    const mapaId = req.nextUrl.searchParams.get('mapa_id')
    const { escopoGlobal } = await getEscopo(me)
    // filtro de empresa: só aplicável a escopo global (master/adm matriz).
    // Para representante o escopo é forçado à empresa dele — o parâmetro é ignorado (segurança inalterada).
    const empresaParam = req.nextUrl.searchParams.get('empresa') || ''
    const empresaFiltro = escopoGlobal ? (empresaParam || null) : null

    // logo da empresa
    let logoUrl: string | null = null, empresaNome = ''
    if (me.empresa_id) {
      const { data: emp } = await supabaseAdmin.from('empresas').select('nome, logo_url').eq('id', me.empresa_id).single()
      logoUrl = emp?.logo_url || null; empresaNome = emp?.nome || ''
    }

    // lista de mapas (histórico)
    let { data: mapas } = await supabaseAdmin.from('mapas_comissao').select('*').order('data_encerramento', { ascending: false })
    mapas = mapas || []

    // Quando NÃO é escopo global (representante) OU há empresa filtrada, os totais gravados por mapa
    // (que somam todas as empresas) precisam ser recalculados considerando só os contratos da(s) empresa(s) permitida(s).
    const precisaRecalcular = !escopoGlobal || !!empresaFiltro
    if (precisaRecalcular && mapas.length > 0) {
      const idsMapas = mapas.map((m: any) => m.id)
      // Paginado: o Supabase corta em 1000 linhas por padrão e a tabela já passa disso,
      // o que escondia os mapas mais novos do caminho do representante.
      let todasLinhas: any[] = []
      { let from = 0; const PAGE = 1000
        while (true) {
          const { data: pg } = await supabaseAdmin.from('mapa_linhas')
            .select('mapa_id, contrato, valor_comissao')
            .in('mapa_id', idsMapas)
            .order('id', { ascending: true })
            .range(from, from + PAGE - 1)
          todasLinhas = todasLinhas.concat(pg || [])
          if (!pg || pg.length < PAGE) break
          from += PAGE
        }
      }
      const contratosSet = [...new Set((todasLinhas || []).map((l: any) => String(l.contrato)))]
      const empresaPorContratoAll: Record<string, string> = {}
      if (contratosSet.length > 0) {
        const { data: vendasAll } = await supabaseAdmin.from('vendas').select('numero_contrato, numero_proposta, empresa_id').or(`numero_contrato.in.(${contratosSet.join(',')}),numero_proposta.in.(${contratosSet.join(',')})`)
        for (const v of (vendasAll || [])) {
          if (v.numero_contrato) empresaPorContratoAll[String(v.numero_contrato)] = v.empresa_id
          if (v.numero_proposta) empresaPorContratoAll[String(v.numero_proposta)] = v.empresa_id
        }
      }
      const empresaPermitida = (contrato: string) => {
        const emp = empresaPorContratoAll[String(contrato)]
        if (!escopoGlobal && emp !== me.empresa_id) return false      // representante: só a empresa dele
        if (empresaFiltro && emp !== empresaFiltro) return false      // filtro ativo (escopo global)
        return true
      }
      const agg: Record<string, { total: number; contratos: Set<string> }> = {}
      for (const l of (todasLinhas || [])) {
        if (!empresaPermitida(l.contrato)) continue
        const k = String(l.mapa_id)
        if (!agg[k]) agg[k] = { total: 0, contratos: new Set() }
        agg[k].total += (l.valor_comissao || 0)
        agg[k].contratos.add(String(l.contrato))
      }
      mapas = mapas
        .map((m: any) => {
          const a = agg[String(m.id)]
          return { ...m, total_comissao: a ? a.total : 0, total_contratos: a ? a.contratos.size : 0 }
        })
        // esconde mapas que ficaram sem nenhum contrato da empresa filtrada/permitida
        .filter((m: any) => m.total_contratos > 0)
    }

    // se pediu um mapa específico, traz as linhas organizadas por cliente
    let detalhe = null
    if (mapaId) {
      // Paginado pelo mesmo motivo: um mapa grande pode ter mais de 1000 linhas.
      let linhas: any[] = []
      { let from = 0; const PAGE = 1000
        while (true) {
          const { data: pg } = await supabaseAdmin.from('mapa_linhas')
            .select('contrato, consorciado, percentual_comis, parcela_de, parcela_ate, valor_comissao')
            .eq('mapa_id', mapaId)
            .order('id', { ascending: true })
            .range(from, from + PAGE - 1)
          linhas = linhas.concat(pg || [])
          if (!pg || pg.length < PAGE) break
          from += PAGE
        }
      }
      // cruza os contratos com as vendas pra pegar nome do cliente e a empresa de cada contrato
      const contratos = [...new Set((linhas || []).map((l: any) => String(l.contrato)))]
      const nomePorContrato: Record<string, string> = {}
      const empresaPorContrato: Record<string, string> = {}
      if (contratos.length > 0) {
        const { data: vendas } = await supabaseAdmin.from('vendas').select('numero_contrato, numero_proposta, empresa_id, clientes(nome)').or(`numero_contrato.in.(${contratos.join(',')}),numero_proposta.in.(${contratos.join(',')})`)
        for (const v of (vendas || [])) {
          const nome = Array.isArray(v.clientes) ? v.clientes[0]?.nome : (v.clientes as any)?.nome
          if (v.numero_contrato) { nomePorContrato[String(v.numero_contrato)] = nome || ''; empresaPorContrato[String(v.numero_contrato)] = v.empresa_id }
          if (v.numero_proposta) { nomePorContrato[String(v.numero_proposta)] = nome || ''; empresaPorContrato[String(v.numero_proposta)] = v.empresa_id }
        }
      }
      // filtra: representante só vê a própria empresa; escopo global respeita o filtro de empresa se houver
      const linhasFiltradas = (linhas || []).filter((l: any) => {
        const emp = empresaPorContrato[String(l.contrato)]
        if (!escopoGlobal && emp !== me.empresa_id) return false
        if (empresaFiltro && emp !== empresaFiltro) return false
        return true
      })
      // agrupa por contrato, montando uma linha resumo por cliente (já filtrado por empresa)
      const porCliente: Record<string, any> = {}
      for (const l of linhasFiltradas) {
        const chave = String(l.contrato)
        const [gr, ct] = String(l.consorciado || '').split('-')
        if (!porCliente[chave]) porCliente[chave] = { contrato: l.contrato, cliente: nomePorContrato[chave] || l.consorciado || 'Não cadastrado', parcelas: [], percentualTotal: 0, total: 0, empresa_id: empresaPorContrato[chave] || null, casada: !!nomePorContrato[String(l.contrato)], estorno: false, grupo: gr ? String(parseInt(gr)) : null, cota: ct ? String(parseInt(ct)) : null }
        // lista de parcelas (de-ate)
        for (let p = l.parcela_de; p <= l.parcela_ate; p++) porCliente[chave].parcelas.push(p)
        porCliente[chave].percentualTotal += l.percentual_comis
        porCliente[chave].total += l.valor_comissao
        if ((l.valor_comissao || 0) < 0) porCliente[chave].estorno = true
      }
      const clientes = Object.values(porCliente).map((c: any) => ({ ...c, parcelas: [...new Set(c.parcelas)].sort((a: any, b: any) => a - b) }))
      const totalGeral = clientes.reduce((s: number, c: any) => s + c.total, 0)
      detalhe = { clientes, totalGeral }
    }

    return NextResponse.json({ mapas: mapas || [], detalhe, logo_url: logoUrl, empresa_nome: empresaNome })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
