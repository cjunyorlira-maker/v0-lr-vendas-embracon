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

const MOTIVOS: Record<string, string> = {
  desistencia_7dias: 'Desistência nos 7 dias',
  desistencia_apos: 'Desistência após o prazo',
  erro_cadastro: 'Erro de cadastro/duplicidade',
  outro: 'Outro',
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
  const { data: me } = await supabaseAdmin.from('usuarios').select('id, role, empresa_id, equipe_id').eq('auth_user_id', authUser.id).single()
  return me
}

// calcula (data_venda + 7 dias) >= hoje
function dentroPrazo(dataVenda: string | null): boolean {
  if (!dataVenda) return false
  const dv = new Date(dataVenda.slice(0, 10) + 'T00:00:00')
  const limite = new Date(dv.getTime() + 7 * 86400000)
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  return limite.getTime() >= hoje.getTime()
}

// busca as linhas de borderô (mapa_linhas) da venda — por venda_id (preferencial) ou contrato/proposta
async function borderoDaVenda(venda: any): Promise<{ total: number; parcelas: number }> {
  let linhas: any[] = []
  // 1) match direto por venda_id
  const { data: porVenda } = await supabaseAdmin
    .from('mapa_linhas')
    .select('valor_comissao, parcela_de, parcela_ate')
    .eq('venda_id', venda.id)
  linhas = porVenda || []
  // 2) fallback por contrato/proposta (mapas antigos sem venda_id)
  if (linhas.length === 0) {
    const chaves = [String(venda.numero_contrato || '').trim(), String(venda.numero_proposta || '').trim()].filter(Boolean)
    if (chaves.length > 0) {
      const { data: porContrato } = await supabaseAdmin
        .from('mapa_linhas')
        .select('valor_comissao, parcela_de, parcela_ate')
        .in('contrato', chaves)
      linhas = porContrato || []
    }
  }
  let total = 0, parcelas = 0
  for (const l of linhas) {
    total += l.valor_comissao || 0
    const de = l.parcela_de || 1, ate = l.parcela_ate || de
    parcelas += Math.max(1, ate - de + 1)
  }
  return { total, parcelas }
}

// checa permissão de escopo sobre a venda
async function podeMexer(me: any, venda: any): Promise<boolean> {
  if (!['master', 'adm', 'representante'].includes(me.role)) return false
  const { escopoGlobal } = await getEscopo(me)
  if (escopoGlobal) return true
  return venda.empresa_id === me.empresa_id
}

// GET ?venda_id= : dados pré-modal (prazo + aviso de borderô)
export async function GET(req: NextRequest) {
  try {
    const me = await autenticar()
    if (!me) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    const vendaId = req.nextUrl.searchParams.get('venda_id')
    if (!vendaId) return NextResponse.json({ error: "venda_id obrigatório" }, { status: 400 })

    const { data: venda } = await supabaseAdmin
      .from('vendas')
      .select('id, empresa_id, data_venda, numero_contrato, numero_proposta, valor_credito, clientes(nome)')
      .eq('id', vendaId).single()
    if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 })
    if (!(await podeMexer(me, venda))) return NextResponse.json({ error: "Sem permissão" }, { status: 403 })

    const bordero = await borderoDaVenda(venda)
    return NextResponse.json({
      data_venda: venda.data_venda,
      dentro_prazo: dentroPrazo(venda.data_venda),
      tem_bordero: bordero.parcelas > 0,
      bordero_total: bordero.total,
      bordero_parcelas: bordero.parcelas,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const me = await autenticar()
    if (!me) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    const body = await req.json()
    const acao = body.acao || 'cancelar'

    const { data: venda } = await supabaseAdmin
      .from('vendas')
      .select('id, empresa_id, vendedor_id, data_venda, numero_contrato, numero_proposta, clientes(nome)')
      .eq('id', body.venda_id).single()
    if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 })
    if (!(await podeMexer(me, venda))) return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    const clienteNome = (Array.isArray(venda.clientes) ? venda.clientes[0]?.nome : (venda.clientes as any)?.nome) || 'Cliente'

    // ── CANCELAR ──
    if (acao === 'cancelar') {
      const motivoKey = body.motivo as string
      if (!motivoKey || !MOTIVOS[motivoKey]) return NextResponse.json({ error: "Informe o motivo do cancelamento" }, { status: 400 })
      let motivoLabel = MOTIVOS[motivoKey]
      if (motivoKey === 'outro') {
        if (!body.motivo_texto?.trim()) return NextResponse.json({ error: "Descreva o motivo" }, { status: 400 })
        motivoLabel = body.motivo_texto.trim()
      }
      const noPrazo = dentroPrazo(venda.data_venda)

      const { error } = await supabaseAdmin.from('vendas').update({
        cancelada: true,
        motivo_cancelamento: motivoLabel,
        cancelamento_dentro_prazo: noPrazo,
        cancelado_em: new Date().toISOString(),
        cancelado_por: me.id,
      }).eq('id', venda.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      // EFEITO DOMINÓ
      // boletos da venda → cancelado
      await supabaseAdmin.from('boletos').update({ status: 'cancelado' }).eq('venda_id', venda.id)
      // lances_config da venda → encerra
      await supabaseAdmin.from('lances_config').update({ ativo: false, status_final: 'cancelado', atualizado_em: new Date().toISOString() }).eq('venda_id', venda.id)

      // notifica o representante da empresa
      try {
        await supabaseAdmin.from('notificacoes').insert({
          empresa_id: venda.empresa_id, destinatario_role: 'representante',
          titulo: 'Venda cancelada', mensagem: `${clienteNome} — ${motivoLabel}${noPrazo ? ' (dentro do prazo de 7 dias)' : ''}`,
          tipo: 'generico', venda_id: venda.id, link_url: '/clientes',
        })
      } catch {}

      return NextResponse.json({ success: true, dentro_prazo: noPrazo })
    }

    // ── REATIVAR (apenas master) ──
    if (acao === 'reativar') {
      if (me.role !== 'master') return NextResponse.json({ error: "Apenas o master pode reativar" }, { status: 403 })
      const { error } = await supabaseAdmin.from('vendas').update({
        cancelada: false,
        motivo_cancelamento: null,
        cancelamento_dentro_prazo: null,
        cancelado_em: null,
        cancelado_por: null,
      }).eq('id', venda.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      // boletos/lances NÃO reativam sozinhos (avisado na confirmação da UI)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
