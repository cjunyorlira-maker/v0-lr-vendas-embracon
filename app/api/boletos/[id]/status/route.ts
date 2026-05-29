import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const TRANSICOES: Record<string, { proximo: string; roles: string[]; campoData: string }> = {
  pendente: { proximo: 'solicitado', roles: ['master','representante','adm'], campoData: 'data_solicitacao' },
  solicitado: { proximo: 'pago_aguardando_baixa', roles: ['master','representante','adm','supervisor','vendedor'], campoData: 'data_pagamento' },
  pago_aguardando_baixa: { proximo: 'enviado_para_baixa', roles: ['master','representante','adm'], campoData: 'data_envio_baixa' },
  enviado_para_baixa: { proximo: 'efetivado', roles: ['master','representante','adm'], campoData: 'data_efetivacao' },
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: boletoId } = await params
    const cookieStore = await cookies()
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )
    const { data: { user: authUser } } = await supabaseUser.auth.getUser()
    if (!authUser) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

    const { data: usuario } = await supabaseAdmin
      .from('usuarios')
      .select('id, role, empresa_id')
      .eq('auth_user_id', authUser.id)
      .single()
    if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const observacao = body.observacao || null
    const comprovante_url = body.comprovante_url || null

    const { data: boleto } = await supabaseAdmin
      .from('boletos')
      .select('*, clientes(nome)')
      .eq('id', boletoId)
      .single()
    if (!boleto) return NextResponse.json({ error: "Boleto não encontrado" }, { status: 404 })

    if (usuario.role !== 'master' && boleto.empresa_id !== usuario.empresa_id) {
      return NextResponse.json({ error: "Sem permissão para esse boleto" }, { status: 403 })
    }

    const statusAtual = boleto.status
    const transicao = TRANSICOES[statusAtual]
    if (!transicao) {
      return NextResponse.json({ error: `Boleto já está em status final (${statusAtual})` }, { status: 400 })
    }
    if (!transicao.roles.includes(usuario.role)) {
      return NextResponse.json({ error: "Seu cargo não pode fazer essa ação" }, { status: 403 })
    }

    const novoStatus = transicao.proximo
    const updateData: any = {
      status: novoStatus,
      atualizado_em: new Date().toISOString(),
      [transicao.campoData]: new Date().toISOString(),
    }
    if (comprovante_url) updateData.comprovante_pagamento_url = comprovante_url

    const { error: updateErr } = await supabaseAdmin
      .from('boletos')
      .update(updateData)
      .eq('id', boletoId)
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    // Log (best-effort, não quebra se falhar)
    try {
      await supabaseAdmin.from('status_log').insert({
        empresa_id: boleto.empresa_id,
        boleto_id: boletoId,
        status_anterior: statusAtual,
        status_novo: novoStatus,
        alterado_por: usuario.id,
        observacao,
      })
    } catch {}

    // Notificações (best-effort)
    try {
      const nomeCliente = boleto.clientes?.nome || 'Cliente'
      const notifs: any[] = []
      if (novoStatus === 'solicitado' && boleto.vendedor_id) {
        notifs.push({ empresa_id: boleto.empresa_id, destinatario_id: boleto.vendedor_id, titulo: 'Boleto solicitado', mensagem: `${nomeCliente} — boleto solicitado à Embracon`, tipo: 'generico', link_url: '/boletos', boleto_id: boletoId })
      } else if (novoStatus === 'pago_aguardando_baixa') {
        notifs.push(
          { empresa_id: boleto.empresa_id, destinatario_role: 'adm', titulo: 'Cliente pagou', mensagem: `${nomeCliente} — pago, aguardando baixa`, tipo: 'cliente_pagou', link_url: '/boletos', boleto_id: boletoId },
          { empresa_id: boleto.empresa_id, destinatario_role: 'representante', titulo: 'Cliente pagou', mensagem: `${nomeCliente} — pago, aguardando baixa`, tipo: 'cliente_pagou', link_url: '/boletos', boleto_id: boletoId }
        )
      } else if (novoStatus === 'efetivado' && boleto.vendedor_id) {
        notifs.push({ empresa_id: boleto.empresa_id, destinatario_id: boleto.vendedor_id, titulo: 'Venda efetivada', mensagem: `${nomeCliente} — venda efetivada!`, tipo: 'efetivado', link_url: '/boletos', boleto_id: boletoId })
      }
      if (notifs.length > 0) await supabaseAdmin.from('notificacoes').insert(notifs)
    } catch {}

    return NextResponse.json({ success: true, novo_status: novoStatus })

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
