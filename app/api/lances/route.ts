import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { getEscopo, getEmpresasAutonomas } from '@/lib/escopo'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

function mesAtualRef(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// GET: lista lances do mês atual + gera os recorrentes que faltam
export async function GET(req: NextRequest) {
  try {
    const incluirAutonomas = new URL(req.url).searchParams.get('incluir_autonomas') === '1'
    const cookieStore = await cookies()
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )
    const { data: { user: authUser } } = await supabaseUser.auth.getUser()
    if (!authUser) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

    const { data: me } = await supabaseAdmin
      .from('usuarios').select('id, role, empresa_id, equipe_id').eq('auth_user_id', authUser.id).single()
    if (!me) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 })

    const mesRef = mesAtualRef()

    // 1. CICLO DA ASSEMBLEIA: pra cada config ativa (recorrente OU não), verifica se o lance
    // atual já passou da assembleia. Se passou: encerra o atual (vai pro histórico) e gera o próximo.
    const { data: configsAtivas } = await supabaseAdmin
      .from('lances_config')
      .select('*')
      .eq('ativo', true)
      .is('status_final', null)

    const hojeStr = new Date().toISOString().slice(0, 10)

    // helper: calcula a próxima assembleia do grupo a partir de uma data
    async function proximaAssembleiaGrupo(grupo: string | null, aposData: string): Promise<string | null> {
      if (!grupo) return null
      const { data: g } = await supabaseAdmin.from('grupos_embracon').select('linha_calendario').eq('grupo', grupo).maybeSingle()
      if (!g?.linha_calendario) return null
      const { data: cal } = await supabaseAdmin.from('calendario_embracon').select('data_assembleia').eq('linha_calendario', g.linha_calendario).order('data_assembleia')
      for (const a of (cal || [])) {
        if (a.data_assembleia > aposData) return a.data_assembleia
      }
      return null
    }

    for (const cfg of (configsAtivas || [])) {
      // "só sorteio": não gera lance mensal (o cliente concorre apenas por sorteio)
      if (cfg.tipo === 'so_sorteio') continue
      // pega o lance ATIVO atual desta config (não encerrado)
      const { data: lanceAtivo } = await supabaseAdmin
        .from('lances_mensais')
        .select('id, data_assembleia, status, contemplado')
        .eq('lance_config_id', cfg.id)
        .neq('ciclo_encerrado', true)
        .order('mes_referencia', { ascending: false })
        .limit(1)
        .maybeSingle()

      // se não tem lance ativo nenhum, pula (lance é criado na ação de criar)
      if (!lanceAtivo) continue
      // se já foi contemplado, não faz nada
      if (lanceAtivo.contemplado) continue
      // se a assembleia ainda não passou, mantém o lance atual (não gera novo)
      if (!lanceAtivo.data_assembleia || lanceAtivo.data_assembleia >= hojeStr) continue

      // A ASSEMBLEIA PASSOU: encerra o lance atual (vai pro histórico) e gera o próximo
      await supabaseAdmin.from('lances_mensais').update({ ciclo_encerrado: true }).eq('id', lanceAtivo.id)

      // calcula a próxima assembleia pelo calendário do grupo
      let grupo: string | null = null
      if (cfg.venda_id) {
        const { data: venda } = await supabaseAdmin.from('vendas').select('grupo').eq('id', cfg.venda_id).single()
        grupo = venda?.grupo || null
      }
      const proxAssembleia = await proximaAssembleiaGrupo(grupo, lanceAtivo.data_assembleia)

      // o mês de referência do novo lance é o mês da PRÓXIMA assembleia (não o mês atual),
      // pra não colidir com a constraint UNIQUE(lance_config_id, mes_referencia) do lance encerrado
      const mesNovoLance = proxAssembleia ? proxAssembleia.slice(0, 7) : mesRef

      // recorrente → volta como solicitado; não-recorrente → volta como pendente (vendedor solicita)
      const statusInicial = cfg.recorrente ? 'solicitado' : 'pendente'
      const { error: errNovo } = await supabaseAdmin.from('lances_mensais').insert({
        lance_config_id: cfg.id, empresa_id: cfg.empresa_id, cliente_id: cfg.cliente_id,
        vendedor_id: cfg.vendedor_id, equipe_id: cfg.equipe_id,
        mes_referencia: mesNovoLance, data_assembleia: proxAssembleia, status: statusInicial,
      })
      if (errNovo) {
        console.error('Erro ao gerar próximo lance da config', cfg.id, errNovo.message)
      }
    }

    // 2. LISTA os lances ATIVOS (não contemplados/cancelados), independente do mês.
    // Um lance solicitado/ofertado que ainda não foi pra assembleia continua valendo.
    let q = supabaseAdmin
      .from('lances_mensais')
      .select('*, lances_config(tipo, valor_percentual, observacao, recorrente, venda_id), clientes(nome), usuarios:vendedor_id(nome), equipes(nome)')
      .in('status', ['pendente', 'solicitado', 'ofertado'])
      .neq('contemplado', true)
      .neq('ciclo_encerrado', true)

    const { escopoGlobal } = await getEscopo(me)
    // ISOLAMENTO: kanban e régua de comprovantes da MATRIZ excluem operações autônomas por padrão.
    // (Contemplados/vitrine seguem com todos — a autônoma conta na vitrine.)
    const autonomasSet = new Set(await getEmpresasAutonomas())
    const filtrarAutonomas = escopoGlobal && !incluirAutonomas && autonomasSet.size > 0
    const semAutonomas = <T extends { empresa_id?: string | null }>(arr: T[]) =>
      filtrarAutonomas ? arr.filter((x) => !(x.empresa_id && autonomasSet.has(x.empresa_id))) : arr
    if (escopoGlobal) { /* master ou adm matriz: vê tudo */ }
    else if (['representante', 'adm'].includes(me.role)) q = q.eq('empresa_id', me.empresa_id)
    else if (me.role === 'supervisor') q = q.eq('equipe_id', me.equipe_id)
    else q = q.eq('vendedor_id', me.id)

    const { data: lances } = await q.order('criado_em', { ascending: false })

    // enriquece com grupo/cota/proposta da venda
    const vendaIds = (lances || []).map((l: any) => l.lances_config?.venda_id).filter(Boolean)
    let vendasMap: Record<string, any> = {}
    if (vendaIds.length > 0) {
      const { data: vendas } = await supabaseAdmin.from('vendas').select('id, grupo, cota, numero_proposta, numero_contrato').in('id', vendaIds)
      for (const v of (vendas || [])) vendasMap[v.id] = v
    }
    const lancesEnriq = (lances || []).map((l: any) => {
      const venda = l.lances_config?.venda_id ? vendasMap[l.lances_config.venda_id] : null
      return { ...l, grupo: venda?.grupo || null, cota: venda?.cota || null, numero_proposta: venda?.numero_proposta || venda?.numero_contrato || null }
    })
    // ordena por data de assembleia (mais próxima primeiro; sem data vai pro fim)
    lancesEnriq.sort((a: any, b: any) => {
      if (!a.data_assembleia) return 1
      if (!b.data_assembleia) return -1
      return new Date(a.data_assembleia).getTime() - new Date(b.data_assembleia).getTime()
    })

    // ── CONTEMPLADOS (histórico/vitrine): mesma lógica de escopo e enriquecimento ──
    let qc = supabaseAdmin
      .from('lances_mensais')
      .select('*, lances_config!inner(id, tipo, valor_percentual, observacao, venda_id, cliente_id, empresa_id, vendedor_id, equipe_id), clientes(nome), usuarios:vendedor_id(nome), equipes(nome)')
      .eq('contemplado', true)
      .order('data_assembleia', { ascending: false })

    if (escopoGlobal) { /* vê tudo */ }
    else if (['representante', 'adm'].includes(me.role)) qc = qc.eq('empresa_id', me.empresa_id)
    else if (me.role === 'supervisor') qc = qc.eq('equipe_id', me.equipe_id)
    else qc = qc.eq('vendedor_id', me.id)

    const { data: contempladosRaw } = await qc

    const vendaIdsC = (contempladosRaw || []).map((l: any) => l.lances_config?.venda_id).filter(Boolean)
    let vendasMapC: Record<string, any> = {}
    if (vendaIdsC.length > 0) {
      const { data: vendasC } = await supabaseAdmin.from('vendas').select('id, grupo, cota, numero_proposta, numero_contrato').in('id', vendaIdsC)
      for (const v of (vendasC || [])) vendasMapC[v.id] = v
    }
    const contemplados = (contempladosRaw || []).map((l: any) => {
      const venda = l.lances_config?.venda_id ? vendasMapC[l.lances_config.venda_id] : null
      return { ...l, grupo: venda?.grupo || null, cota: venda?.cota || null, numero_proposta: venda?.numero_proposta || venda?.numero_contrato || null }
    })

    // ── COMPROVANTES NÃO BAIXADOS (régua de cobrança): assembleia já passou e ninguém baixou ──
    // independe de mês e de ciclo_encerrado
    let qn = supabaseAdmin
      .from('lances_mensais')
      .select('*, lances_config!inner(venda_id, cliente_id, empresa_id, vendedor_id, tipo), clientes(nome), usuarios:vendedor_id(nome), empresas(nome)')
      .not('comprovante_url', 'is', null)
      .eq('comprovante_baixado', false)
      .lt('data_assembleia', hojeStr)
      .order('data_assembleia', { ascending: true })

    if (escopoGlobal) { /* vê tudo */ }
    else if (['representante', 'adm'].includes(me.role)) qn = qn.eq('empresa_id', me.empresa_id)
    else if (me.role === 'supervisor') qn = qn.eq('equipe_id', me.equipe_id)
    else qn = qn.eq('vendedor_id', me.id)

    const { data: naoBaixadosRaw } = await qn
    const vendaIdsN = (naoBaixadosRaw || []).map((l: any) => l.lances_config?.venda_id).filter(Boolean)
    let vendasMapN: Record<string, any> = {}
    if (vendaIdsN.length > 0) {
      const { data: vendasN } = await supabaseAdmin.from('vendas').select('id, grupo, cota, numero_proposta, numero_contrato').in('id', vendaIdsN)
      for (const v of (vendasN || [])) vendasMapN[v.id] = v
    }
    const comprovantes_nao_baixados = (naoBaixadosRaw || []).map((l: any) => {
      const venda = l.lances_config?.venda_id ? vendasMapN[l.lances_config.venda_id] : null
      return {
        ...l,
        cliente_nome: l.clientes?.nome || null,
        empresa_nome: l.empresas?.nome || null,
        vendedor_nome: l.usuarios?.nome || null,
        grupo: venda?.grupo || null,
        cota: venda?.cota || null,
        numero_proposta: venda?.numero_proposta || venda?.numero_contrato || null,
      }
    })

    // ── SÓ SORTEIO (clientes fora da fila de lances, concorrendo por sorteio) ──
    let qss = supabaseAdmin
      .from('lances_config')
      .select('id, tipo, cliente_id, venda_id, empresa_id, equipe_id, vendedor_id, criado_em, atualizado_em, clientes(nome), usuarios:vendedor_id(nome), equipes(nome)')
      .eq('tipo', 'so_sorteio')
      .eq('ativo', true)
      .is('status_final', null)
    if (escopoGlobal) { /* vê tudo */ }
    else if (['representante', 'adm'].includes(me.role)) qss = qss.eq('empresa_id', me.empresa_id)
    else if (me.role === 'supervisor') qss = qss.eq('equipe_id', me.equipe_id)
    else qss = qss.eq('vendedor_id', me.id)
    const { data: soSorteioRaw } = await qss.order('atualizado_em', { ascending: false })
    const vendaIdsSS = (soSorteioRaw || []).map((c: any) => c.venda_id).filter(Boolean)
    let vendasMapSS: Record<string, any> = {}
    if (vendaIdsSS.length > 0) {
      const { data: vendasSS } = await supabaseAdmin.from('vendas').select('id, grupo, cota, numero_proposta, numero_contrato').in('id', vendaIdsSS)
      for (const v of (vendasSS || [])) vendasMapSS[v.id] = v
    }
    const soSorteio = (soSorteioRaw || []).map((c: any) => {
      const venda = c.venda_id ? vendasMapSS[c.venda_id] : null
      return {
        ...c,
        grupo: venda?.grupo || null, cota: venda?.cota || null,
        numero_proposta: venda?.numero_proposta || venda?.numero_contrato || null,
        desde: c.atualizado_em || c.criado_em || null,
      }
    })

    // opções de filtro conforme o role
    let empresasOpc: any[] = [], equipesOpc: any[] = [], vendedoresOpc: any[] = []
    if (escopoGlobal) {
      const { data: emp } = await supabaseAdmin.from('empresas').select('id, nome').order('nome'); empresasOpc = emp || []
      const { data: eq } = await supabaseAdmin.from('equipes').select('id, nome, empresa_id').order('nome'); equipesOpc = eq || []
      const { data: vd } = await supabaseAdmin.from('usuarios').select('id, nome, empresa_id, equipe_id').in('role', ['vendedor', 'supervisor']).order('nome'); vendedoresOpc = vd || []
    } else if (['representante', 'adm'].includes(me.role)) {
      const { data: eq } = await supabaseAdmin.from('equipes').select('id, nome, empresa_id').eq('empresa_id', me.empresa_id).order('nome'); equipesOpc = eq || []
      const { data: vd } = await supabaseAdmin.from('usuarios').select('id, nome, empresa_id, equipe_id').in('role', ['vendedor', 'supervisor']).eq('empresa_id', me.empresa_id).order('nome'); vendedoresOpc = vd || []
    } else if (me.role === 'supervisor') {
      const { data: vd } = await supabaseAdmin.from('usuarios').select('id, nome, empresa_id, equipe_id').in('role', ['vendedor', 'supervisor']).eq('equipe_id', me.equipe_id).order('nome'); vendedoresOpc = vd || []
    }

    const lancesVisiveis = semAutonomas(lancesEnriq)
    const comprovantesVisiveis = semAutonomas(comprovantes_nao_baixados)
    const ocultosAutonomas = filtrarAutonomas
      ? (lancesEnriq.length - lancesVisiveis.length) + (comprovantes_nao_baixados.length - comprovantesVisiveis.length)
      : 0

    const soSorteioVisiveis = semAutonomas(soSorteio)

    return NextResponse.json({
      mes_referencia: mesRef, lances: lancesVisiveis, contemplados, comprovantes_nao_baixados: comprovantesVisiveis, so_sorteio: soSorteioVisiveis, meu_role: me.role,
      filtros: { empresas: empresasOpc, equipes: equipesOpc, vendedores: vendedoresOpc },
      escopo_global: escopoGlobal,
      tem_autonomas: autonomasSet.size > 0,
      incluindo_autonomas: incluirAutonomas,
      ocultos_autonomas: ocultosAutonomas,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
