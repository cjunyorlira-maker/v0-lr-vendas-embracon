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

// ajusta uma data pro próximo dia útil (pula sábado/domingo)
function proximoDiaUtil(d: Date): Date {
  const r = new Date(d)
  while (r.getDay() === 0 || r.getDay() === 6) r.setDate(r.getDate() + 1)
  return r
}

// calcula o período de produção padrão (dia 21 ajustado -> dia anterior ao próximo início)
function periodoPadrao(): { inicio: string; fim: string } {
  const hoje = new Date()
  const ano = hoje.getFullYear()
  const mes = hoje.getMonth() // 0-11

  // início do período corrente: dia 21 do mês anterior (ajustado pra dia útil)
  let inicioMes = mes, inicioAno = ano
  if (hoje.getDate() >= 21) { inicioMes = mes; } else { inicioMes = mes - 1 }
  if (inicioMes < 0) { inicioMes = 11; inicioAno-- }
  const inicioRaw = new Date(inicioAno, inicioMes, 21)
  const inicio = proximoDiaUtil(inicioRaw)

  // início do PRÓXIMO período: dia 21 do mês seguinte ao início (ajustado)
  let proxMes = inicioMes + 1, proxAno = inicioAno
  if (proxMes > 11) { proxMes = 0; proxAno++ }
  const proxRaw = new Date(proxAno, proxMes, 21)
  const proxInicio = proximoDiaUtil(proxRaw)
  // fim = 1 dia antes do próximo início
  const fim = new Date(proxInicio)
  fim.setDate(fim.getDate() - 1)

  return { inicio: inicio.toISOString().slice(0, 10), fim: fim.toISOString().slice(0, 10) }
}

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

    const { data: me } = await supabaseAdmin
      .from('usuarios').select('id, role, empresa_id, equipe_id').eq('auth_user_id', authUser.id).single()
    if (!me) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const modo = searchParams.get('modo') || 'vendedor' // vendedor | equipe | empresa | representante
    const filtroEmpresa = searchParams.get('empresa') || ''
    let padrao = periodoPadrao()
    try {
      const { data: cfg } = await supabaseAdmin.from('config_producao').select('data_inicio, data_fim').eq('id', 1).single()
      if (cfg?.data_inicio && cfg?.data_fim) padrao = { inicio: cfg.data_inicio, fim: cfg.data_fim }
    } catch {}
    const inicio = searchParams.get('inicio') || padrao.inicio
    const fim = searchParams.get('fim') || padrao.fim

    // busca vendas no período (com escopo do usuário)
    let q = supabaseAdmin
      .from('vendas')
      .select('valor_credito, vendedor_id, equipe_id, empresa_id, criado_em, data_venda, usuarios:vendedor_id(nome, foto_url), equipes(nome), empresas(nome)')
      .gte('data_venda', inicio)
      .lte('data_venda', fim)

    if (me.role === 'master') { /* tudo */ }
    else if ((await getEscopo(me)).escopoGlobal) { /* adm matriz vê tudo */ }
    else if (['representante', 'adm'].includes(me.role)) q = q.eq('empresa_id', me.empresa_id)
    else if (me.role === 'supervisor') q = q.eq('equipe_id', me.equipe_id)
    // vendedor vê o ranking todo da empresa dele (pra se comparar)
    else if (me.role === 'vendedor') q = q.eq('empresa_id', me.empresa_id)

    if (filtroEmpresa) q = q.eq('empresa_id', filtroEmpresa)
    const { data: vendas } = await q
    const lista = vendas || []

    // agrupa conforme o modo
    const mapa = new Map<string, { nome: string; foto?: string; valor: number; qtd: number }>()
    for (const v of lista as any[]) {
      let chave = '', nome = '', foto = undefined
      if (modo === 'vendedor') {
        const u = Array.isArray(v.usuarios) ? v.usuarios[0] : v.usuarios
        chave = v.vendedor_id || 'sem'; nome = u?.nome || 'Sem vendedor'; foto = u?.foto_url
      }
      else if (modo === 'equipe') {
        const e = Array.isArray(v.equipes) ? v.equipes[0] : v.equipes
        chave = v.equipe_id || 'sem'; nome = e?.nome || 'Sem equipe'
      }
      else if (modo === 'empresa') {
        const emp = Array.isArray(v.empresas) ? v.empresas[0] : v.empresas
        chave = v.empresa_id || 'sem'; nome = emp?.nome || 'Sem empresa'
      }
      else {
        // representante: agrupa por empresa, mas mostra o nome do representante dela
        const emp = Array.isArray(v.empresas) ? v.empresas[0] : v.empresas
        chave = v.empresa_id || 'sem'; nome = emp?.nome || 'Sem empresa'
      }
      if (!mapa.has(chave)) mapa.set(chave, { nome, foto, valor: 0, qtd: 0 })
      const item = mapa.get(chave)!
      item.valor += v.valor_credito || 0
      item.qtd += 1
    }

    // modo representante: busca o nome do representante de cada empresa
    if (modo === 'representante') {
      const empresaIds = Array.from(mapa.keys()).filter(k => k !== 'sem')
      if (empresaIds.length > 0) {
        const { data: reps } = await supabaseAdmin.from('usuarios').select('nome, foto_url, empresa_id').eq('role', 'representante').in('empresa_id', empresaIds)
        for (const [chave, item] of mapa.entries()) {
          const rep = (reps || []).find((r: any) => r.empresa_id === chave)
          if (rep) { item.nome = rep.nome; item.foto = rep.foto_url }
        }
      }
    }
    const ranking = Array.from(mapa.values())
      .sort((a, b) => b.valor - a.valor)
      .map((r, i) => ({ posicao: i + 1, ...r }))

    return NextResponse.json({ ranking, periodo: { inicio, fim }, modo, meu_role: me.role })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
