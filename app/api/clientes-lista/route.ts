import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

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
    const { data: me } = await supabaseAdmin.from('usuarios').select('id, role, empresa_id, equipe_id').eq('auth_user_id', authUser.id).single()
    if (!me) return NextResponse.json({ error: "Sem usuário" }, { status: 403 })

    // busca vendas com escopo
    let q = supabaseAdmin.from('vendas')
      .select('id, cliente_id, numero_proposta, numero_contrato, grupo, cota, valor_credito, adesao_percent, data_assembleia_entrada, data_venda, empresa_id, equipe_id, vendedor_id, checado, pdf_proposta_url, planos(sigla, nome_completo, bem, adesao_percent), clientes(id, nome, cpf_cnpj, telefone), usuarios:vendedor_id(nome), boletos(status, qtd_parcelas, data_proxima_cobranca)')
      .order('data_assembleia_entrada', { ascending: true })

    if (me.role === 'representante' || me.role === 'adm') q = q.eq('empresa_id', me.empresa_id)
    else if (me.role === 'supervisor') q = q.eq('equipe_id', me.equipe_id)
    else if (me.role === 'vendedor') q = q.eq('vendedor_id', me.id)
    const { data: vendas } = await q

    // lances ativos por venda (pra saber pendente/ofertado)
    const { data: lances } = await supabaseAdmin.from('lances_config').select('venda_id, ativo, status_final')

    const cotas = (vendas || []).map((v: any) => {
      const plano = Array.isArray(v.planos) ? v.planos[0] : v.planos
      const cliente = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes
      const vendedor = Array.isArray(v.usuarios) ? v.usuarios[0] : v.usuarios
      const boleto = Array.isArray(v.boletos) ? v.boletos[0] : v.boletos
      const lance = (lances || []).find((l: any) => l.venda_id === v.id && l.ativo)
      return {
        venda_id: v.id, cliente_id: v.cliente_id,
        nome: cliente?.nome || '-', cpf: cliente?.cpf_cnpj || '-', telefone: cliente?.telefone || '',
        grupo: v.grupo, cota: v.cota, credito: v.valor_credito,
        bem: plano?.bem || '-', adesao: v.adesao_percent ?? plano?.adesao_percent ?? null,
        plano: plano?.sigla || '-',
        data_assembleia: v.data_assembleia_entrada, data_venda: v.data_venda,
        vendedor: vendedor?.nome || null, vendedor_id: v.vendedor_id, equipe_id: v.equipe_id, empresa_id: v.empresa_id,
        status_boleto: boleto?.status || 'pendente', qtd_parcelas: boleto?.qtd_parcelas || 0,
        proxima_cobranca: boleto?.data_proxima_cobranca || null,
        tem_lance: !!lance, checado: v.checado || false,
        pdf_proposta_url: v.pdf_proposta_url,
      }
    })

    // agrupa por cliente
    const porCliente: Record<string, any> = {}
    for (const c of cotas) {
      if (!porCliente[c.cliente_id]) {
        porCliente[c.cliente_id] = { cliente_id: c.cliente_id, nome: c.nome, cpf: c.cpf, telefone: c.telefone, cotas: [] }
      }
      porCliente[c.cliente_id].cotas.push(c)
    }

    return NextResponse.json({ clientes: Object.values(porCliente), meu_role: me.role })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
