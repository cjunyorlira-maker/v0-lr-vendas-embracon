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
      .select('id, cliente_id, numero_proposta, numero_contrato, grupo, cota, valor_credito, adesao_percent, com_seguro, data_assembleia_entrada, data_venda, empresa_id, equipe_id, vendedor_id, checado, status_cliente, pdf_proposta_url, observacoes, planos(sigla, nome_completo, bem, adesao_percent), clientes(id, nome, cpf_cnpj, telefone), usuarios:vendedor_id(nome), equipes(nome), boletos(status, qtd_parcelas, data_proxima_cobranca)')
      .order('data_assembleia_entrada', { ascending: true })

    const { escopoGlobal } = await getEscopo(me)
    if (escopoGlobal) {
      // master ou adm da matriz: vê tudo (sem filtro)
    } else if (me.role === 'representante' || me.role === 'adm') q = q.eq('empresa_id', me.empresa_id)
    else if (me.role === 'supervisor') q = q.eq('equipe_id', me.equipe_id)
    else if (me.role === 'vendedor') q = q.eq('vendedor_id', me.id)
    const { data: vendas } = await q

    // lances ativos por venda + status do lance do mês atual
    const { data: lancesConfig } = await supabaseAdmin.from('lances_config').select('id, venda_id, ativo, status_final')
    const mesAtual = new Date().toISOString().slice(0, 7) // YYYY-MM
    const { data: lancesMes } = await supabaseAdmin.from('lances_mensais').select('lance_config_id, status, contemplado').eq('mes_referencia', mesAtual)

    const cotas = (vendas || []).map((v: any) => {
      const plano = Array.isArray(v.planos) ? v.planos[0] : v.planos
      const cliente = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes
      const vendedor = Array.isArray(v.usuarios) ? v.usuarios[0] : v.usuarios
      const boleto = Array.isArray(v.boletos) ? v.boletos[0] : v.boletos
      const lanceCfg = (lancesConfig || []).find((l: any) => l.venda_id === v.id && l.ativo)
      let statusLance: string | null = null
      if (lanceCfg) {
        const lm = (lancesMes || []).find((m: any) => m.lance_config_id === lanceCfg.id)
        if (lanceCfg.status_final === 'contemplado') statusLance = 'contemplado'
        else if (lm?.status) statusLance = lm.status  // usa o status real: pendente / solicitado / ofertado
        else statusLance = 'pendente'
      }
      return {
        venda_id: v.id, cliente_id: v.cliente_id,
        nome: cliente?.nome || '-', cpf: cliente?.cpf_cnpj || '-', telefone: cliente?.telefone || '',
        grupo: v.grupo, cota: v.cota, numero_proposta: v.numero_proposta, numero_contrato: v.numero_contrato, credito: v.valor_credito,
        bem: plano?.bem || '-', adesao: v.adesao_percent ?? plano?.adesao_percent ?? null,
        com_seguro: v.com_seguro || false,
        plano: plano?.sigla || '-',
        data_assembleia: v.data_assembleia_entrada, data_venda: v.data_venda,
        vendedor: vendedor?.nome || null, equipe_nome: (Array.isArray(v.equipes) ? v.equipes[0]?.nome : v.equipes?.nome) || null, vendedor_id: v.vendedor_id, equipe_id: v.equipe_id, empresa_id: v.empresa_id,
        status_cliente: v.status_cliente || 'em_dia',
        status_boleto: boleto?.status || 'pendente', qtd_parcelas: boleto?.qtd_parcelas || 0,
        proxima_cobranca: boleto?.data_proxima_cobranca || null,
        status_lance: statusLance, checado: v.checado || false,
        pdf_proposta_url: v.pdf_proposta_url,
        observacoes: v.observacoes || null,
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

    // opções de filtro conforme role (supervisor incluído na lista de vendedores)
    let empresasOpc: any[] = [], equipesOpc: any[] = [], vendedoresOpc: any[] = []
    if (escopoGlobal) {
      const { data: emp } = await supabaseAdmin.from('empresas').select('id, nome').order('nome'); empresasOpc = emp || []
      const { data: eq } = await supabaseAdmin.from('equipes').select('id, nome, empresa_id').order('nome'); equipesOpc = eq || []
      const { data: vd } = await supabaseAdmin.from('usuarios').select('id, nome, empresa_id, equipe_id, role').in('role', ['vendedor','supervisor','representante']).order('nome'); vendedoresOpc = vd || []
    } else if (['representante','adm'].includes(me.role)) {
      const { data: eq } = await supabaseAdmin.from('equipes').select('id, nome, empresa_id').eq('empresa_id', me.empresa_id).order('nome'); equipesOpc = eq || []
      const { data: vd } = await supabaseAdmin.from('usuarios').select('id, nome, empresa_id, equipe_id, role').in('role', ['vendedor','supervisor','representante']).eq('empresa_id', me.empresa_id).order('nome'); vendedoresOpc = vd || []
    } else if (me.role === 'supervisor') {
      const { data: vd } = await supabaseAdmin.from('usuarios').select('id, nome, empresa_id, equipe_id, role').in('role', ['vendedor','supervisor']).eq('equipe_id', me.equipe_id).order('nome'); vendedoresOpc = vd || []
    }

    return NextResponse.json({
      clientes: Object.values(porCliente), meu_role: me.role,
      filtros: { empresas: empresasOpc, equipes: equipesOpc, vendedores: vendedoresOpc },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
