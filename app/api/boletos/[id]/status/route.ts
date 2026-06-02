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

// Fluxo: pendente -> solicitado -> aguardando_pagamento -> aguardando_baixa -> efetivado
const TRANSICOES: Record<string, { proximo: string; roles: string[]; campoData: string }> = {
  pendente: { proximo: 'solicitado', roles: ['master','representante','adm'], campoData: 'data_solicitacao' },
  solicitado: { proximo: 'aguardando_pagamento', roles: ['master','representante','adm'], campoData: 'data_anexo_boleto' },
  aguardando_pagamento: { proximo: 'aguardando_baixa', roles: ['master','representante','adm','supervisor','vendedor'], campoData: 'data_pagamento' },
  aguardando_baixa: { proximo: 'efetivado', roles: ['master','representante','adm'], campoData: 'data_efetivacao' },
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
      .from('usuarios').select('id, role, empresa_id').eq('auth_user_id', authUser.id).single()
    if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const observacao = body.observacao || null
    const boleto_pdf_url = body.boleto_pdf_url || null
    const boleto_pdf_nome = body.boleto_pdf_nome || null

    const { data: boleto } = await supabaseAdmin
      .from('boletos').select('*, clientes(nome)').eq('id', boletoId).single()
    if (!boleto) return NextResponse.json({ error: "Boleto não encontrado" }, { status: 404 })

    const { escopoGlobal } = await getEscopo(usuario)
    if (!escopoGlobal && boleto.empresa_id !== usuario.empresa_id) {
      return NextResponse.json({ error: "Sem permissão para esse boleto" }, { status: 403 })
    }

    const statusAtual = boleto.status

    // Caso especial: pagou via TED (do pendente vai direto pra aguardando_baixa)
    if (body.acao === 'pagou_ted') {
      if (statusAtual !== 'pendente' && statusAtual !== 'solicitado' && statusAtual !== 'aguardando_pagamento') {
        return NextResponse.json({ error: "Só pode marcar TED antes da baixa" }, { status: 400 })
      }
      await supabaseAdmin.from('boletos').update({
        status: 'aguardando_baixa',
        pago_via_ted: true,
        data_ted: new Date().toISOString().slice(0, 10),
        data_pagamento: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
      }).eq('id', boleto.id)
      try {
        await supabaseAdmin.from('status_log').insert({
          empresa_id: boleto.empresa_id, boleto_id: boletoId,
          status_anterior: statusAtual, status_novo: 'aguardando_baixa',
          alterado_por: usuario.id, observacao: 'Pago via TED',
        })
      } catch {}
      try {
        const nomeCliente = boleto.clientes?.nome || 'Cliente'
        await supabaseAdmin.from('notificacoes').insert([
          { empresa_id: boleto.empresa_id, destinatario_role: 'adm', titulo: 'Cliente pagou (TED)', mensagem: `${nomeCliente} — pago via TED, aguardando baixa`, tipo: 'cliente_pagou', link_url: '/boletos', boleto_id: boletoId },
          { empresa_id: boleto.empresa_id, destinatario_role: 'representante', titulo: 'Cliente pagou (TED)', mensagem: `${nomeCliente} — pago via TED, aguardando baixa`, tipo: 'cliente_pagou', link_url: '/boletos', boleto_id: boletoId },
        ])
      } catch {}
      return NextResponse.json({ success: true, novo_status: 'aguardando_baixa' })
    }

    const transicao = TRANSICOES[statusAtual]
    if (!transicao) return NextResponse.json({ error: `Boleto já está em status final` }, { status: 400 })
    if (!transicao.roles.includes(usuario.role)) return NextResponse.json({ error: "Seu cargo não pode fazer essa ação" }, { status: 403 })

    const novoStatus = transicao.proximo
    const updateData: any = {
      status: novoStatus,
      atualizado_em: new Date().toISOString(),
      [transicao.campoData]: new Date().toISOString(),
    }
    // ao sair de "solicitado" (anexar boleto), salva o PDF do boleto
    if (statusAtual === 'solicitado' && boleto_pdf_url) {
      updateData.boleto_pdf_url = boleto_pdf_url
      updateData.boleto_pdf_nome = boleto_pdf_nome
    }

    const { error: updateErr } = await supabaseAdmin.from('boletos').update(updateData).eq('id', boletoId)
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    try {
      await supabaseAdmin.from('status_log').insert({
        empresa_id: boleto.empresa_id, boleto_id: boletoId,
        status_anterior: statusAtual, status_novo: novoStatus,
        alterado_por: usuario.id, observacao,
      })
    } catch {}

    try {
      const nomeCliente = boleto.clientes?.nome || 'Cliente'
      const notifs: any[] = []
      if (novoStatus === 'aguardando_pagamento' && boleto.vendedor_id) {
        notifs.push({ empresa_id: boleto.empresa_id, destinatario_id: boleto.vendedor_id, titulo: 'Boleto disponível', mensagem: `${nomeCliente} — boleto anexado, aguardando pagamento`, tipo: 'generico', link_url: '/boletos', boleto_id: boletoId })
      } else if (novoStatus === 'aguardando_baixa') {
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
