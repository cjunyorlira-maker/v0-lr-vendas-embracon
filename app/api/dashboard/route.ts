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

const hojeISO = () => new Date().toISOString().slice(0, 10)

// primeiro dia (DOMINGO) da semana corrente — getDay(): domingo=0
const inicioSemanaDomingoISO = () => {
  const d = new Date()
  const dia = d.getDay() // 0=domingo .. 6=sábado
  d.setDate(d.getDate() - dia)
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
  const topVend = Array.from(vendMap.values()).sort((a, b) => b.valor - a.valor)[0] || null
  const topEq = Array.from(eqMap.values()).sort((a, b) => b.valor - a.valor)[0] || null
  const topEmp = Array.from(empMap.values()).sort((a, b) => b.valor - a.valor)[0] || null
  return {
    vendedor: topVend ? { nome: topVend.nome, foto: topVend.foto || null, equipe: topVend.equipe || null, empresa: topVend.empresa || null, valor: topVend.valor } : null,
    equipe: topEq ? { nome: topEq.nome, empresa: topEq.empresa || null, valor: topEq.valor } : null,
    representacao: topEmp ? { nome: topEmp.nome, logo: topEmp.logo || null, valor: topEmp.valor } : null,
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
    const diasRestantes = Math.max(0, Math.ceil((new Date(pFim + 'T23:59:59').getTime() - Date.now()) / 86400000))
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

    // 3. CAMPEÕES DO MÊS (produção corrente, geral)
    const campeoes_mes = calcularCampeoes(listaProd)

    // 4. MELHORES DA SEMANA (domingo → hoje, geral)
    const inicioSemana = inicioSemanaDomingoISO()
    const { data: vendasSemana } = await supabaseAdmin
      .from('vendas')
      .select('valor_credito, vendedor_id, equipe_id, empresa_id, usuarios:vendedor_id(nome, foto_url, placeholder), equipes(nome), empresas(nome, logo_url)')
      .gte('data_venda', inicioSemana).lte('data_venda', hoje)
    const melhores_semana = calcularCampeoes((vendasSemana || []) as any[])

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
    const pendentesArr = lancesAtivos.filter((l) => ['pendente', 'solicitado'].includes(l.status))
    const ofertadosAguardando = lancesAtivos.filter((l) => l.status === 'ofertado').length
    const em7 = new Date(); em7.setDate(em7.getDate() + 7)
    const em7Str = em7.toISOString().slice(0, 10)
    const datasFuturas = pendentesArr
      .map((l) => l.data_assembleia)
      .filter((d): d is string => !!d && d >= hoje)
      .sort()
    const dataAssembleiaProxima = datasFuturas[0] || null
    const pendentesProxima = pendentesArr.filter((l) => l.data_assembleia && l.data_assembleia >= hoje && l.data_assembleia <= em7Str).length
    const lances_alerta = {
      pendentes: pendentesArr.length,
      pendentes_proxima_assembleia: pendentesProxima,
      data_assembleia_proxima: dataAssembleiaProxima,
      ofertados_aguardando: ofertadosAguardando,
    }

    // 6. VENCIMENTOS (escopo por empresa) — próximos 15 dias, não efetivados, máx 6
    let vq = supabaseAdmin
      .from('boletos')
      .select('data_proxima_cobranca, valor_boleto, status, clientes(nome), vendas(grupo, cota)')
      .not('data_proxima_cobranca', 'is', null)
      .neq('status', 'efetivado')
    if (!escopoGlobal && me.empresa_id) vq = vq.eq('empresa_id', me.empresa_id)
    const { data: boletos } = await vq
    const em15 = new Date(); em15.setDate(em15.getDate() + 15)
    const em15Str = em15.toISOString().slice(0, 10)
    const vencimentos = ((boletos || []) as any[])
      .filter((b) => b.data_proxima_cobranca >= hoje && b.data_proxima_cobranca <= em15Str)
      .sort((a, b) => a.data_proxima_cobranca.localeCompare(b.data_proxima_cobranca))
      .slice(0, 6)
      .map((b) => ({
        data: b.data_proxima_cobranca,
        cliente: primeiro<any>(b.clientes)?.nome || '—',
        grupo: primeiro<any>(b.vendas)?.grupo || '',
        cota: primeiro<any>(b.vendas)?.cota || '',
        valor: b.valor_boleto || 0,
      }))

    // 7. PRÓXIMA SEXTA (APENAS master e representante) — fila de mapas não pagos
    let proxima_sexta: { valor: number; data: string } | undefined = undefined
    if (['master', 'representante'].includes(me.role)) {
      let mq = supabaseAdmin.from('mapas_comissao').select('id, empresa_id, data_encerramento, total_comissao, pago').eq('pago', false)
      // representante: só a empresa dele; master: global
      if (me.role === 'representante' && me.empresa_id) mq = mq.eq('empresa_id', me.empresa_id)
      const { data: mapas } = await mq
      const porData = new Map<string, number>()
      for (const mp of (mapas || []) as any[]) {
        if (!mp.data_encerramento) continue
        const dp = dataPagamentoMapa(mp.data_encerramento).toISOString()
        porData.set(dp, (porData.get(dp) || 0) + (mp.total_comissao || 0))
      }
      const ordenado = Array.from(porData.entries()).sort((a, b) => a[0].localeCompare(b[0]))
      if (ordenado.length > 0) proxima_sexta = { data: ordenado[0][0], valor: ordenado[0][1] }
      else proxima_sexta = { data: '', valor: 0 }
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
      campeoes_mes,
      melhores_semana,
      lances_alerta,
      vencimentos,
      avisos: avisosRaw || [],
    }
    if (proxima_sexta !== undefined) payload.proxima_sexta = proxima_sexta

    return NextResponse.json(payload)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
