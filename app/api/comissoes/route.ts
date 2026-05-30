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

    // só representante/adm/master veem comissões
    if (!['master', 'representante', 'adm'].includes(me.role)) {
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
      .select('id, valor_credito, comissao_vendedor_percent, comissao_supervisor_percent, comissao_recebida_rs, comissao_recebida_percent, criado_em, clientes(nome), usuarios:vendedor_id(nome), planos(sigla, comissao_total, estorno_percent, estorno_ate_pgto, categoria_comissao), boletos(qtd_parcelas, status)')
      .order('criado_em', { ascending: false })

    if (me.role !== 'master') q = q.eq('empresa_id', me.empresa_id)
    const { data: vendas } = await q

    const lista = (vendas || []).map((v: any) => {
      const plano = Array.isArray(v.planos) ? v.planos[0] : v.planos
      const cliente = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes
      const vendedor = Array.isArray(v.usuarios) ? v.usuarios[0] : v.usuarios
      const boleto = Array.isArray(v.boletos) ? v.boletos[0] : v.boletos
      const credito = v.valor_credito || 0
      const comLR = plano?.comissao_total ? credito * (plano.comissao_total / 100) : 0
      // precedência: % individual da venda > padrão da categoria do plano > 0
      const catPlano = plano?.categoria_comissao
      const cfgCat = (configCategorias || []).find((cc: any) => cc.categoria === catPlano)
      const pVend = v.comissao_vendedor_percent ?? cfgCat?.percentual_vendedor ?? 0
      const pSup = v.comissao_supervisor_percent ?? cfgCat?.percentual_supervisor ?? 0
      const comVend = credito * (pVend / 100)
      const comSup = credito * (pSup / 100)
      // risco de estorno
      const qtdParc = boleto?.qtd_parcelas || 0
      const pgtosCobertos = 1 + qtdParc
      const pgtoSeg = plano?.estorno_ate_pgto || 8
      const emRisco = pgtosCobertos < pgtoSeg
      const estorno = plano?.estorno_percent ? credito * (plano.estorno_percent / 100) : 0
      return {
        id: v.id, criado_em: v.criado_em, cliente: cliente?.nome || '-', vendedor: vendedor?.nome || '-',
        plano: plano?.sigla || '-', credito,
        comissao_lr: comLR, percentual_vendedor: pVend, comissao_vendedor: comVend,
        percentual_supervisor: pSup, comissao_supervisor: comSup,
        comissao_recebida_rs: v.comissao_recebida_rs || 0,
        comissao_recebida_percent: v.comissao_recebida_percent || 0,
        em_risco: emRisco, valor_estorno: estorno, faltam: emRisco ? pgtoSeg - pgtosCobertos : 0, pgto_seguranca: pgtoSeg,
      }
    })

    return NextResponse.json({ vendas: lista, config, config_categorias: configCategorias || [], meu_role: me.role })
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
    if (!me || !['master', 'representante', 'adm'].includes(me.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }

    const body = await req.json()

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
          atualizado_em: new Date().toISOString(),
        }, { onConflict: 'empresa_id,categoria' })
      }
      return NextResponse.json({ success: true })
    }

    // aplicar % nas vendas (lote ou individual)
    if (body.acao === 'aplicar') {
      const { venda_ids, percentual_vendedor, percentual_supervisor } = body
      if (!Array.isArray(venda_ids) || venda_ids.length === 0) return NextResponse.json({ error: "Nenhuma venda selecionada" }, { status: 400 })
      const update: any = {}
      if (percentual_vendedor !== undefined && percentual_vendedor !== null && percentual_vendedor !== '') update.comissao_vendedor_percent = parseFloat(percentual_vendedor)
      if (percentual_supervisor !== undefined && percentual_supervisor !== null && percentual_supervisor !== '') update.comissao_supervisor_percent = parseFloat(percentual_supervisor)
      if (Object.keys(update).length === 0) return NextResponse.json({ error: "Informe ao menos um percentual" }, { status: 400 })
      await supabaseAdmin.from('vendas').update(update).in('id', venda_ids)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
