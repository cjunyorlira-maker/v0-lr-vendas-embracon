import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

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

    const { data: criador } = await supabaseAdmin
      .from('usuarios')
      .select('id, role, empresa_id, equipe_id')
      .eq('auth_user_id', authUser.id)
      .single()

    if (!criador) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 })

    const body = await req.json()
    const {
      nome_cliente, cpf_cnpj, telefone, email,
      numero_proposta, numero_contrato, grupo, cota, data_venda,
      valor_credito, valor_primeira_parcela, valor_demais_parcelas,
      adesao_percent, plano_id,
      qtd_parcelas, valor_boleto,
      pdf_base64, pdf_nome,
      empresa_id_alvo, equipe_id_alvo, vendedor_id_alvo,
      observacoes,
      data_assembleia_entrada,
      proxima_cobranca,
    } = body

    if (!nome_cliente || !valor_credito) {
      return NextResponse.json({ error: "Nome do cliente e valor do crédito são obrigatórios" }, { status: 400 })
    }

    // Determina empresa/equipe/vendedor da venda
    let empresa_id = criador.empresa_id
    let equipe_id = criador.equipe_id
    let vendedor_id = criador.id

    // Master/ADM/Representante podem atribuir a outros
    if (['master', 'representante', 'adm'].includes(criador.role)) {
      if (empresa_id_alvo) empresa_id = empresa_id_alvo
      if (equipe_id_alvo) equipe_id = equipe_id_alvo
      if (vendedor_id_alvo) vendedor_id = vendedor_id_alvo
    } else if (criador.role === 'supervisor') {
      // Supervisor atribui a vendedor da equipe dele
      if (vendedor_id_alvo) vendedor_id = vendedor_id_alvo
    }

    if (!empresa_id) {
      return NextResponse.json({ error: "Empresa não definida" }, { status: 400 })
    }

    // 1. Upload do PDF (se enviado)
    let pdf_url: string | null = null
    if (pdf_base64) {
      try {
        const matches = String(pdf_base64).match(/^data:(.+);base64,(.+)$/)
        if (matches) {
          const base64Data = matches[2]
          const pdfBuffer = Buffer.from(base64Data, 'base64')
          const fileName = `${empresa_id}/${Date.now()}-${(pdf_nome || 'proposta').replace(/[^a-zA-Z0-9.\-]/g, '_')}`
          const { error: upErr } = await supabaseAdmin.storage
            .from('propostas-pdf')
            .upload(fileName, pdfBuffer, { contentType: 'application/pdf', upsert: false })
          if (!upErr) {
            pdf_url = fileName // guarda o path (bucket privado)
          }
        }
      } catch (e) {
        console.error('Erro upload PDF:', e)
      }
    }

    // 2. Cria cliente
    const { data: cliente, error: clienteErr } = await supabaseAdmin
      .from('clientes')
      .insert({
        empresa_id,
        vendedor_id,
        equipe_id,
        nome: String(nome_cliente).trim(),
        cpf_cnpj: cpf_cnpj || null,
        telefone: telefone || null,
        email: email || null,
      })
      .select('id')
      .single()

    if (clienteErr || !cliente) {
      return NextResponse.json({ error: "Erro ao criar cliente: " + (clienteErr?.message || '') }, { status: 500 })
    }

    // 3. Cria venda
    const { data: venda, error: vendaErr } = await supabaseAdmin
      .from('vendas')
      .insert({
        empresa_id,
        cliente_id: cliente.id,
        vendedor_id,
        equipe_id,
        plano_id: plano_id || null,
        numero_proposta: numero_proposta || null,
        numero_contrato: numero_contrato || null,
        grupo: grupo || null,
        cota: cota || null,
        valor_credito,
        valor_primeira_parcela: valor_primeira_parcela || null,
        valor_demais_parcelas: valor_demais_parcelas || null,
        adesao_percent: adesao_percent || null,
        pdf_proposta_url: pdf_url,
        pdf_proposta_nome: pdf_nome || null,
        observacoes: observacoes || null,
        data_assembleia_entrada: data_assembleia_entrada || null,
        data_venda: data_venda || null,
      })
      .select('id')
      .single()

    if (vendaErr || !venda) {
      return NextResponse.json({ error: "Erro ao criar venda: " + (vendaErr?.message || '') }, { status: 500 })
    }

    // 4. Cria boleto pendente
    const { data: boleto, error: boletoErr } = await supabaseAdmin
      .from('boletos')
      .insert({
        empresa_id,
        venda_id: venda.id,
        cliente_id: cliente.id,
        vendedor_id,
        equipe_id,
        qtd_parcelas: qtd_parcelas || 1,
        valor_boleto: valor_boleto || valor_primeira_parcela || 0,
        status: 'pendente',
        meses_cobertos: qtd_parcelas || 1,
        data_proxima_cobranca: proxima_cobranca || null,
        criado_por: criador.id,
      })
      .select('id')
      .single()

    if (boletoErr) {
      console.error('Erro ao criar boleto:', boletoErr)
    }

    // 4b. Cria lance PENDENTE automático (o cliente entra em Lances aguardando o vendedor definir o lance)
    try {
      const { data: cfgLance } = await supabaseAdmin.from('lances_config').insert({
        empresa_id, cliente_id: cliente.id, venda_id: venda.id,
        vendedor_id, equipe_id,
        tipo: 'fixo25', valor_percentual: null, observacao: null,
        recorrente: false, ativo: true, criado_por: criador.id,
      }).select('id').single()
      if (cfgLance) {
        const mesRefLance = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
        await supabaseAdmin.from('lances_mensais').insert({
          lance_config_id: cfgLance.id, empresa_id, cliente_id: cliente.id,
          vendedor_id, equipe_id, mes_referencia: mesRefLance,
          data_assembleia: data_assembleia_entrada || null, status: 'pendente',
        })
      }
    } catch (e) {
      console.error('Erro ao criar lance pendente:', e)
    }

    // 5. Notifica ADM/Representante da empresa (nova venda pendente)
    if (boleto) {
      await supabaseAdmin.from('notificacoes').insert([
        {
          empresa_id,
          destinatario_role: 'adm',
          titulo: 'Nova venda pendente',
          mensagem: `${nome_cliente} — aguardando solicitação de boleto`,
          tipo: 'nova_venda',
          link_url: '/boletos',
          boleto_id: boleto.id,
          venda_id: venda.id,
        },
        {
          empresa_id,
          destinatario_role: 'representante',
          titulo: 'Nova venda pendente',
          mensagem: `${nome_cliente} — aguardando solicitação de boleto`,
          tipo: 'nova_venda',
          link_url: '/boletos',
          boleto_id: boleto.id,
          venda_id: venda.id,
        },
      ])
    }

    return NextResponse.json({
      success: true,
      venda_id: venda.id,
      cliente_id: cliente.id,
      boleto_id: boleto?.id || null,
    })

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
