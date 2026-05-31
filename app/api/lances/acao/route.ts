import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

function mesAtualRef(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

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

    const { data: me } = await supabaseAdmin
      .from('usuarios').select('id, role, empresa_id, equipe_id').eq('auth_user_id', authUser.id).single()
    if (!me) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 })

    const body = await req.json()
    const acao = body.acao

    // ── CRIAR lance (config + lance do mês atual) ──
    if (acao === 'criar') {
      const { cliente_id, venda_id, tipo, valor_percentual, observacao, recorrente } = body
      if (!cliente_id || !tipo) return NextResponse.json({ error: "Cliente e tipo são obrigatórios" }, { status: 400 })

      // pega dados do cliente/venda pra escopo
      const { data: cliente } = await supabaseAdmin.from('clientes').select('empresa_id, vendedor_id, equipe_id').eq('id', cliente_id).single()
      if (!cliente) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })

      let dataAssembleia: string | null = null
      if (venda_id) {
        const { data: venda } = await supabaseAdmin.from('vendas').select('data_assembleia_entrada').eq('id', venda_id).single()
        dataAssembleia = venda?.data_assembleia_entrada || null
      }

      const { data: cfg, error: cfgErr } = await supabaseAdmin.from('lances_config').insert({
        empresa_id: cliente.empresa_id, cliente_id, venda_id: venda_id || null,
        vendedor_id: cliente.vendedor_id, equipe_id: cliente.equipe_id,
        tipo, valor_percentual: valor_percentual || null, observacao: observacao || null,
        recorrente: !!recorrente, ativo: true, criado_por: me.id,
      }).select('id').single()
      if (cfgErr || !cfg) return NextResponse.json({ error: cfgErr?.message || 'Erro' }, { status: 500 })

      // cria o lance do mês atual JÁ como solicitado (o vendedor já definiu o valor na criação)
      await supabaseAdmin.from('lances_mensais').insert({
        lance_config_id: cfg.id, empresa_id: cliente.empresa_id, cliente_id,
        vendedor_id: cliente.vendedor_id, equipe_id: cliente.equipe_id,
        mes_referencia: mesAtualRef(), data_assembleia: dataAssembleia, status: 'solicitado',
      })

      // notifica ADM/representante (novo lance pra ofertar)
      try {
        const { data: cli } = await supabaseAdmin.from('clientes').select('nome').eq('id', cliente_id).single()
        await supabaseAdmin.from('notificacoes').insert([
          { empresa_id: cliente.empresa_id, destinatario_role: 'adm', titulo: 'Novo lance pra ofertar', mensagem: `${cli?.nome || 'Cliente'} — lance pendente`, tipo: 'generico', link_url: '/lances' },
          { empresa_id: cliente.empresa_id, destinatario_role: 'representante', titulo: 'Novo lance pra ofertar', mensagem: `${cli?.nome || 'Cliente'} — lance pendente`, tipo: 'generico', link_url: '/lances' },
        ])
      } catch {}

      return NextResponse.json({ success: true, config_id: cfg.id })
    }

    // ── SOLICITAR (vendedor define o valor do lance: pendente -> solicitado) ──
    if (acao === 'solicitar') {
      const { lance_id } = body
      if (!lance_id) return NextResponse.json({ error: "lance_id obrigatório" }, { status: 400 })
      // pega a config do lance
      const { data: lanceM } = await supabaseAdmin.from('lances_mensais').select('lance_config_id, empresa_id, cliente_id').eq('id', lance_id).single()
      if (!lanceM) return NextResponse.json({ error: "Lance não encontrado" }, { status: 404 })
      // atualiza a config (tipo, valor, observação, recorrente) se vier
      const updCfg: any = {}
      if (body.tipo) updCfg.tipo = body.tipo
      if (body.valor_percentual !== undefined) updCfg.valor_percentual = body.valor_percentual
      if (body.observacao !== undefined) updCfg.observacao = body.observacao
      if (body.recorrente !== undefined) updCfg.recorrente = body.recorrente
      if (Object.keys(updCfg).length > 0) {
        await supabaseAdmin.from('lances_config').update(updCfg).eq('id', lanceM.lance_config_id)
      }
      // marca o lance do mês como solicitado
      const { error } = await supabaseAdmin.from('lances_mensais').update({ status: 'solicitado' }).eq('id', lance_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      // notifica adm/rep
      const { data: cli } = await supabaseAdmin.from('clientes').select('nome').eq('id', lanceM.cliente_id).single()
      await supabaseAdmin.from('notificacoes').insert([
        { empresa_id: lanceM.empresa_id, destinatario_role: 'adm', titulo: 'Lance solicitado', mensagem: `${cli?.nome || 'Cliente'} — pronto pra ofertar`, tipo: 'generico', link_url: '/lances' },
        { empresa_id: lanceM.empresa_id, destinatario_role: 'representante', titulo: 'Lance solicitado', mensagem: `${cli?.nome || 'Cliente'} — pronto pra ofertar`, tipo: 'generico', link_url: '/lances' },
      ])
      return NextResponse.json({ success: true })
    }

    // ── OFERTAR (anexa comprovante, marca ofertado) ──
    if (acao === 'ofertar') {
      const { lance_id, comprovante_url, comprovante_nome } = body
      if (!lance_id) return NextResponse.json({ error: "lance_id obrigatório" }, { status: 400 })
      if (!['master','representante','adm'].includes(me.role)) return NextResponse.json({ error: "Apenas ADM/representante pode ofertar" }, { status: 403 })

      const { error } = await supabaseAdmin.from('lances_mensais').update({
        status: 'ofertado', comprovante_url: comprovante_url || null, comprovante_nome: comprovante_nome || null,
        data_oferta: new Date().toISOString(),
      }).eq('id', lance_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // ── BAIXAR comprovante (marca baixado) ──
    if (acao === 'baixou_comprovante') {
      const { lance_id } = body
      await supabaseAdmin.from('lances_mensais').update({
        comprovante_baixado: true, comprovante_baixado_por: me.id, comprovante_baixado_em: new Date().toISOString(),
      }).eq('id', lance_id)
      return NextResponse.json({ success: true })
    }

    // ── MARCAR CONTEMPLADO ──
    if (acao === 'contemplado') {
      const { lance_id, config_id, cliente_nome } = body
      await supabaseAdmin.from('lances_mensais').update({ contemplado: true }).eq('id', lance_id)
      // encerra a config (não gera mais lances)
      if (config_id) {
        await supabaseAdmin.from('lances_config').update({ ativo: false, status_final: 'contemplado', atualizado_em: new Date().toISOString() }).eq('id', config_id)
      }
      // alerta de contemplação
      try {
        const { data: lance } = await supabaseAdmin.from('lances_mensais').select('empresa_id, vendedor_id, clientes(nome)').eq('id', lance_id).single()
        if (lance) {
          const nome = (lance as any).clientes?.nome || 'Cliente'
          const notifs: any[] = [{ empresa_id: lance.empresa_id, destinatario_role: 'adm', titulo: 'Cliente contemplado!', mensagem: `${nome} foi contemplado no lance`, tipo: 'efetivado', link_url: '/lances' }]
          if (lance.vendedor_id) notifs.push({ empresa_id: lance.empresa_id, destinatario_id: lance.vendedor_id, titulo: 'Cliente contemplado!', mensagem: `${nome} foi contemplado no lance`, tipo: 'efetivado', link_url: '/lances' })
          await supabaseAdmin.from('notificacoes').insert(notifs)
        }
      } catch {}
      return NextResponse.json({ success: true })
    }

    // ── CANCELAR config ──
    if (acao === 'cancelar') {
      const { config_id } = body
      if (!['master','representante','adm'].includes(me.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
      await supabaseAdmin.from('lances_config').update({ ativo: false, status_final: 'cancelado', atualizado_em: new Date().toISOString() }).eq('id', config_id)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
