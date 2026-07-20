import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { getEscopo } from '@/lib/escopo'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ── datas SEMPRE em horário de Brasília (BRT, UTC-3), comparadas como string YYYY-MM-DD ──
// (evita bug: à noite o toISOString() em UTC "pula" para o dia seguinte e some com vencimentos)
const nowBRT = () => new Date(Date.now() - 3 * 3600 * 1000)
const hojeISO = () => nowBRT().toISOString().slice(0, 10)
const emNdiasISO = (n: number) => {
  const d = nowBRT()
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// primeiro dia (DOMINGO) da semana corrente em BRT — getUTCDay() sobre a data já deslocada
const inicioSemanaDomingoISO = () => {
  const d = nowBRT()
  const dia = d.getUTCDay() // 0=domingo .. 6=sábado
  d.setUTCDate(d.getUTCDate() - dia)
  return d.toISOString().slice(0, 10)
}

const primeiro = <T,>(x: T | T[] | null | undefined): T | null =>
  Array.isArray(x) ? (x[0] ?? null) : (x ?? null)

// Embracon paga na SEXTA da semana seguinte ao encerramento, 18h (mesma regra da tela de comissões)
function dataPagamentoMapa(dataEnc: string): Date {
  const d = new Date(dataEnc + 'T00:00:00')
  const dow = d.getDay() === 0 ? 7 : d.getDay() // dom=7
  const proxSegunda = new Date(d); proxSegunda.setDate(d.getDate() + (8 - dow))
  const sexta = new Date(proxSegunda); sexta.setDate(proxSegunda.getDate() + 4)
  sexta.setHours(18, 0, 0, 0)
  return sexta
}

// agrega os 3 campeões (vendedor, equipe, representação) de uma lista de vendas
function calcularCampeoes(vendas: any[]) {
  const eqMap = new Map<string, { nome: string; empresa?: string; valor: number }>()
  const empMap = new Map<string, { nome: string; logo?: string; valor: number }>()
  const vendMap = new Map<string, { nome: string; foto?: string; equipe?: string; empresa?: string; valor: number }>()
  for (const v of vendas) {
    const cred = v.valor_credito || 0
    const u = primeiro<any>(v.usuarios)
    const eq = primeiro<any>(v.equipes)
    const emp = primeiro<any>(v.empresas)
    if (v.equipe_id && eq) {
      const it = eqMap.get(v.equipe_id) || { nome: eq?.nome || 'Equipe', empresa: emp?.nome, valor: 0 }
      it.valor += cred; if (!it.empresa && emp?.nome) it.empresa = emp.nome; eqMap.set(v.equipe_id, it)
    }
    if (v.empresa_id) {
      const it = empMap.get(v.empresa_id) || { nome: emp?.nome || 'Representação', logo: emp?.logo_url, valor: 0 }
      it.valor += cred; if (!it.logo && emp?.logo_url) it.logo = emp.logo_url; empMap.set(v.empresa_id, it)
    }
    // vendedor: exclui placeholders (cadastros-representação)
    if (v.vendedor_id && u?.placeholder !== true) {
      const it = vendMap.get(v.vendedor_id) || { nome: u?.nome || 'Vendedor', foto: u?.foto_url, equipe: eq?.nome, empresa: emp?.nome, valor: 0 }
      it.valor += cred; if (!it.equipe && eq?.nome) it.equipe = eq.nome; if (!it.empresa && emp?.nome) it.empresa = emp.nome; vendMap.set(v.vendedor_id, it)
    }
  }
  // TOP 3 de cada categoria (ordenado desc, só com valor > 0)
  const top3 = <T extends { valor: number }>(m: Map<string, T>) =>
    Array.from(m.values()).filter((x) => x.valor > 0).sort((a, b) => b.valor - a.valor).slice(0, 3)
  return {
    vendedores: top3(vendMap).map((v) => ({ nome: v.nome, foto: v.foto || null, equipe: v.equipe || null, empresa: v.empresa || null, valor: v.valor })),
    equipes: top3(eqMap).map((e) => ({ nome: e.nome, empresa: e.empresa || null, valor: e.valor })),
    representacoes: top3(empMap).map((r) => ({ nome: r.nome, logo: r.logo || null, valor: r.valor })),
  }
}

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

    const { data: me } = await supabaseAdmin
      .from('usuarios').select('id, role, empresa_id, equipe_id').eq('auth_user_id', authUser.id).single()
    if (!me) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 })

    const { escopoGlobal } = await getEscopo(me)
    const hoje = hojeISO()

    // ── produção corrente (tabela producoes; a que contém hoje, senão a mais recente) ──
    const { data: producoesRaw } = await supabaseAdmin
      .from('producoes')
      .select('id, nome, data_inicio, data_fim, meta_valor')
      .order('data_inicio', { ascending: false })
    const producoes = producoesRaw || []
    const producao = producoes.find((p: any) => p.data_inicio <= hoje && p.data_fim >= hoje) || producoes[0] || null
    const pInicio = producao?.data_inicio || `${new Date().getFullYear()}-01-01`
    const pFim = producao?.data_fim || `${new Date().getFullYear()}-12-31`

    // ── vendas da PRODUÇÃO corrente (GLOBAL) — serve meta, campeões e minha operação ──
    const { data: vendasProd } = await supabaseAdmin
      .from('vendas')
      .select('valor_credito, vendedor_id, equipe_id, empresa_id, data_venda, usuarios:vendedor_id(nome, foto_url, placeholder), equipes(nome), empresas(nome, logo_url)')
      .gte('data_venda', pInicio).lte('data_venda', pFim)
    const listaProd = (vendasProd || []) as any[]

    // 1. META (MASTER LR — global)
    const metaValor = producao?.meta_valor || 0
    const vendidoMaster = listaProd.reduce((s, v) => s + (v.valor_credito || 0), 0)
    // fim da produção às 23:59:59 BRT (offset -03:00 explícito, independe do TZ do servidor)
    const diasRestantes = Math.max(0, Math.ceil((Date.parse(pFim + 'T23:59:59-03:00') - Date.now()) / 86400000))
    const ritmoNecessario = Math.max(0, (metaValor - vendidoMaster)) / Math.max(1, diasRestantes)
    const meta = {
      valor: metaValor,
      vendido_master: vendidoMaster,
      dias_restantes: diasRestantes,
      ritmo_necessario: ritmoNecessario,
      pct: metaValor > 0 ? Math.min(100, (vendidoMaster / metaValor) * 100) : 0,
      producao_nome: producao?.nome || null,
      cotas_master: listaProd.length,
    }

    // 2. MINHA OPERAÇÃO (todos menos master) — a EMPRESA do usuário
    let minha_operacao: any = null
    if (me.role !== 'master' && !escopoGlobal && me.empresa_id) {
      const daEmpresa = listaProd.filter((v) => v.empresa_id === me.empresa_id)
      const vendido = daEmpresa.reduce((s, v) => s + (v.valor_credito || 0), 0)
      const cotas = daEmpresa.length
      const { data: emp } = await supabaseAdmin.from('empresas').select('nome').eq('id', me.empresa_id).single()
      minha_operacao = {
        empresa_nome: emp?.nome || 'Minha empresa',
        vendido,
        cotas,
        ticket: cotas > 0 ? vendido / cotas : 0,
        pct_da_master: vendidoMaster > 0 ? (vendido / vendidoMaster) * 100 : 0,
      }
    }

    // 2b. FATIA DA PRÓPRIA EMPRESA DO MASTER (além do consolidado global)
    let minha_fatia_master: any = null
    if (me.role === 'master' && me.empresa_id) {
      const daEmpresa = listaProd.filter((v) => v.empresa_id === me.empresa_id)
      const vendido = daEmpresa.reduce((s, v) => s + (v.valor_credito || 0), 0)
      const cotas = daEmpresa.length
      const { data: emp } = await supabaseAdmin.from('empresas').select('nome').eq('id', me.empresa_id).single()
      minha_fatia_master = {
        empresa_nome: emp?.nome || 'Minha empresa',
        vendido,
        cotas,
        pct_da_producao: vendidoMaster > 0 ? (vendido / vendidoMaster) * 100 : 0,
      }
    }

    // 3. CAMPEÕES DO MÊS — geral + recorte da própria empresa (para o toggle no card)
    const campeoes_mes = {
      geral: calcularCampeoes(listaProd),
      minha_empresa: me.empresa_id ? calcularCampeoes(listaProd.filter((v) => v.empresa_id === me.empresa_id)) : null,
    }

    // 4. MELHORES DA SEMANA (domingo → hoje) — geral + recorte da própria empresa
    const inicioSemana = inicioSemanaDomingoISO()
    const { data: vendasSemana } = await supabaseAdmin
      .from('vendas')
      .select('valor_credito, vendedor_id, equipe_id, empresa_id, usuarios:vendedor_id(nome, foto_url, placeholder), equipes(nome), empresas(nome, logo_url)')
      .gte('data_venda', inicioSemana).lte('data_venda', hoje)
    const listaSemana = (vendasSemana || []) as any[]
    const melhores_semana = {
      geral: calcularCampeoes(listaSemana),
      minha_empresa: me.empresa_id ? calcularCampeoes(listaSemana.filter((v) => v.empresa_id === me.empresa_id)) : null,
    }
    // nome da empresa do usuário (rótulo do toggle "Minha representação")
    const minha_empresa_nome = minha_fatia_master?.empresa_nome || minha_operacao?.empresa_nome || null

    // 5. LANCES (alerta) — escopo por role, igual à tela de lances
    let lq = supabaseAdmin
      .from('lances_mensais')
      .select('status, data_assembleia, contemplado, ciclo_encerrado, empresa_id, equipe_id, vendedor_id')
      .in('status', ['pendente', 'solicitado', 'ofertado'])
      .neq('contemplado', true)
      .neq('ciclo_encerrado', true)
    if (escopoGlobal) { /* vê tudo */ }
    else if (['representante', 'adm'].includes(me.role)) lq = lq.eq('empresa_id', me.empresa_id)
    else if (me.role === 'supervisor') lq = lq.eq('equipe_id', me.equipe_id)
    else lq = lq.eq('vendedor_id', me.id)
    const { data: lancesRaw } = await lq
    const lancesAtivos = (lancesRaw || []) as any[]
    const em7Str = emNdiasISO(7)
    // resume um conjunto de lances nos mesmos indicadores do card
    const resumirLances = (arr: any[]) => {
      const pendentesArr = arr.filter((l) => ['pendente', 'solicitado'].includes(l.status))
      const ofertadosAguardando = arr.filter((l) => l.status === 'ofertado').length
      const datasFuturas = pendentesArr
        .map((l) => l.data_assembleia)
        .filter((d): d is string => !!d && d >= hoje)
        .sort()
      const pendentesProxima = pendentesArr.filter((l) => l.data_assembleia && l.data_assembleia >= hoje && l.data_assembleia <= em7Str).length
      return {
        pendentes: pendentesArr.length,
        pendentes_proxima_assembleia: pendentesProxima,
        data_assembleia_proxima: datasFuturas[0] || null,
        ofertados_aguardando: ofertadosAguardando,
      }
    }
    const lances_alerta = resumirLances(lancesAtivos)
    // master: mesmos indicadores, mas filtrados pela PRÓPRIA empresa (fatia "a minha parte")
    let lances_minha_empresa: ReturnType<typeof resumirLances> | null = null
    if (me.role === 'master' && me.empresa_id) {
      lances_minha_empresa = resumirLances(lancesAtivos.filter((l) => l.empresa_id === me.empresa_id))
    }

    // 6. VENCIMENTOS (escopo por empresa) — próximos 15 dias, não efetivados, máx 6
    let vq = supabaseAdmin
      .from('boletos')
      .select('data_proxima_cobranca, valor_boleto, status, clientes(nome), vendas(grupo, cota)')
      .not('data_proxima_cobranca', 'is', null)
      // a próxima cobrança pertence AOS efetivados (parcela seguinte à antecipação); só exclui cancelados
      .neq('status', 'cancelado')
    // escopo em cascata (mesmo espírito da tela de lances):
    if (escopoGlobal) { /* master / adm matriz: vê tudo */ }
    else if (['representante', 'adm'].includes(me.role)) vq = vq.eq('empresa_id', me.empresa_id) // da empresa
    else if (me.role === 'supervisor') vq = vq.eq('equipe_id', me.equipe_id)                     // da equipe dele
    else vq = vq.eq('vendedor_id', me.id)                                                        // só os dele
    const { data: boletos } = await vq
    const em15Str = emNdiasISO(15)
    const vencimentos = ((boletos || []) as any[])
      // compara só a parte YYYY-MM-DD (datas do banco podem vir com hora); tudo em BRT
      .filter((b) => {
        const d = String(b.data_proxima_cobranca).slice(0, 10)
        return d >= hoje && d <= em15Str
      })
      .sort((a, b) => String(a.data_proxima_cobranca).slice(0, 10).localeCompare(String(b.data_proxima_cobranca).slice(0, 10)))
      .slice(0, 6)
      .map((b) => ({
        data: String(b.data_proxima_cobranca).slice(0, 10),
        cliente: primeiro<any>(b.clientes)?.nome || '—',
        grupo: primeiro<any>(b.vendas)?.grupo || '',
        cota: primeiro<any>(b.vendas)?.cota || '',
        valor: b.valor_boleto || 0,
      }))

    // 7. PRÓXIMA SEXTA (APENAS master e representante) — fila de mapas não pagos
    let proxima_sexta: { valor: number; data: string; fatia_empresa?: number; empresa_nome?: string } | undefined = undefined
    if (['master', 'representante'].includes(me.role)) {
      // Os mapas do borderô são GLOBAIS (empresa_id null). Buscamos todos os pago=false
      // (null OU da própria empresa) — vale para master e representante.
      const { data: mapas } = await supabaseAdmin
        .from('mapas_comissao').select('id, empresa_id, data_encerramento, total_comissao, pago').eq('pago', false)
      const porData = new Map<string, number>()
      const mapaIdsPorData = new Map<string, string[]>() // data de pagamento -> ids dos mapas
      for (const mp of (mapas || []) as any[]) {
        if (!mp.data_encerramento) continue
        if (me.role === 'representante' && mp.empresa_id && mp.empresa_id !== me.empresa_id) continue // futuro financeiro_proprio
        const dp = dataPagamentoMapa(mp.data_encerramento).toISOString()
        porData.set(dp, (porData.get(dp) || 0) + (mp.total_comissao || 0))
        mapaIdsPorData.set(dp, [...(mapaIdsPorData.get(dp) || []), mp.id])
      }
      const ordenado = Array.from(porData.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      const proxData = ordenado.length > 0 ? ordenado[0][0] : ''
      const totalGlobalProx = ordenado.length > 0 ? ordenado[0][1] : 0

      // Fatia da empresa via cruzamento por CONTRATO (mapa_linhas não têm empresa_id):
      // contratos da empresa × linhas dos mapas da próxima data de pagamento.
      const fatiaDaEmpresa = async (empresaId: string): Promise<number> => {
        if (!proxData) return 0
        const { data: vendasEmp } = await supabaseAdmin
          .from('vendas').select('numero_contrato, numero_proposta').eq('empresa_id', empresaId)
        const contratosDaEmpresa = new Set<string>()
        for (const v of (vendasEmp || []) as any[]) {
          const c = String(v.numero_contrato || v.numero_proposta || '').trim()
          if (c) contratosDaEmpresa.add(c)
        }
        const mapaIdsProx = new Set(mapaIdsPorData.get(proxData) || [])
        let fatia = 0, from = 0
        const PAGE = 1000
        while (true) {
          const { data: pg } = await supabaseAdmin
            .from('mapa_linhas').select('mapa_id, contrato, valor_comissao')
            .order('id', { ascending: true }).range(from, from + PAGE - 1)
          for (const l of (pg || []) as any[]) {
            if (!mapaIdsProx.has(l.mapa_id)) continue
            if (contratosDaEmpresa.has(String(l.contrato).trim())) fatia += (l.valor_comissao || 0)
          }
          if (!pg || pg.length < PAGE) break
          from += PAGE
        }
        return fatia
      }

      if (me.role === 'master') {
        // master: valor principal GLOBAL + linha da fatia da própria empresa (SJC)
        proxima_sexta = { data: proxData, valor: totalGlobalProx }
        if (me.empresa_id) {
          proxima_sexta.empresa_nome = minha_fatia_master?.empresa_nome || 'Minha empresa'
          proxima_sexta.fatia_empresa = await fatiaDaEmpresa(me.empresa_id)
        }
      } else {
        // representante: valor principal = a FATIA da empresa dele (nunca o total global)
        const fatia = me.empresa_id ? await fatiaDaEmpresa(me.empresa_id) : 0
        proxima_sexta = { data: proxData, valor: fatia }
      }
    }

    // 8. AVISOS (ativos, fixados primeiro, depois criado_em desc, máx 8)
    const { data: avisosRaw } = await supabaseAdmin
      .from('avisos')
      .select('id, titulo, mensagem, tipo, fixado, criado_em')
      .eq('ativo', true)
      .order('fixado', { ascending: false })
      .order('criado_em', { ascending: false })
      .limit(8)

    const payload: any = {
      meu_role: me.role,
      pode_publicar_avisos: escopoGlobal, // master OU adm da matriz
      meta,
      minha_operacao,
      minha_fatia_master,
      campeoes_mes,
      melhores_semana,
      minha_empresa_nome,
      lances_alerta,
      lances_minha_empresa,
      vencimentos,
      avisos: avisosRaw || [],
    }
    if (proxima_sexta !== undefined) payload.proxima_sexta = proxima_sexta

    return NextResponse.json(payload)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
