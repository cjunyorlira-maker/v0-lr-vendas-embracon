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
    const { data: me } = await supabaseAdmin.from('usuarios').select('id, role, empresa_id').eq('auth_user_id', authUser.id).single()
    if (!me || !['master', 'representante', 'adm', 'supervisor'].includes(me.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }

    const body = await req.json()
    const { venda_id, vendedor_id, equipe_id, empresa_id, qtd_parcelas } = body
    if (!venda_id) return NextResponse.json({ error: "venda_id obrigatório" }, { status: 400 })

    const upd: any = {}
    if (vendedor_id !== undefined) upd.vendedor_id = vendedor_id || null
    if (equipe_id !== undefined) upd.equipe_id = equipe_id || null
    if (empresa_id !== undefined && empresa_id) upd.empresa_id = empresa_id

    const { error } = await supabaseAdmin.from('vendas').update(upd).eq('id', venda_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // propaga pro boleto, lances E o cliente (pra manter consistência nos filtros e na separação por empresa)
    if (Object.keys(upd).length > 0) {
      await supabaseAdmin.from('boletos').update(upd).eq('venda_id', venda_id)
      const { data: cfgs } = await supabaseAdmin.from('lances_config').select('id').eq('venda_id', venda_id)
      for (const c of (cfgs || [])) {
        await supabaseAdmin.from('lances_config').update(upd).eq('id', c.id)
        await supabaseAdmin.from('lances_mensais').update(upd).eq('lance_config_id', c.id)
      }
      // se mudou a empresa, atualiza também o registro do cliente
      if (upd.empresa_id) {
        const { data: v } = await supabaseAdmin.from('vendas').select('cliente_id').eq('id', venda_id).single()
        if (v?.cliente_id) await supabaseAdmin.from('clientes').update({ empresa_id: upd.empresa_id }).eq('id', v.cliente_id)
      }
    }

    // EDIÇÃO DE PARCELAS ANTECIPADAS: recalcula valor do boleto e próxima cobrança
    if (qtd_parcelas !== undefined && qtd_parcelas !== null && qtd_parcelas !== '') {
      const novaQtd = parseInt(String(qtd_parcelas)) || 0
      const { data: venda } = await supabaseAdmin
        .from('vendas')
        .select('grupo, valor_demais_parcelas, valor_primeira_parcela, planos(categoria_comissao)')
        .eq('id', venda_id).single()
      const planoVenda = Array.isArray(venda?.planos) ? venda?.planos[0] : venda?.planos
      const ehParcelinha = planoVenda?.categoria_comissao === 'imovel_parcelinha'
      // Parcelinha: antecipa as parcelas 1-12 (valor da primeira_parcela). Outros: antecipa as demais.
      const valorParcelaAntecipada = ehParcelinha ? (venda?.valor_primeira_parcela || 0) : (venda?.valor_demais_parcelas || 0)
      const novoValorBoleto = valorParcelaAntecipada * novaQtd
      // recalcula a próxima cobrança: base (próximo vencimento do grupo) + (qtd+1) meses
      let novaCobranca: string | null = null
      if (venda?.grupo) {
        const { data: grupo } = await supabaseAdmin
          .from('grupos_embracon').select('linha_calendario, data_assembleia_manual')
          .eq('grupo', venda.grupo).single()
        let linhaCal = grupo?.linha_calendario
        if (!linhaCal && grupo?.data_assembleia_manual) {
          const { data: m } = await supabaseAdmin.from('calendario_embracon')
            .select('linha_calendario').eq('data_assembleia', grupo.data_assembleia_manual).limit(1).single()
          if (m?.linha_calendario) linhaCal = m.linha_calendario
        }
        if (linhaCal) {
          const { data: cal } = await supabaseAdmin.from('calendario_embracon')
            .select('mes, data_vencimento').eq('linha_calendario', linhaCal).order('mes')
          const hoje = new Date()
          const base = (cal || []).map((c: any) => new Date(c.data_vencimento + 'T00:00:00')).filter((d: Date) => d >= hoje).sort((a: Date, b: Date) => a.getTime() - b.getTime())[0]
          if (base) {
            const alvo = new Date(base); alvo.setMonth(alvo.getMonth() + novaQtd + 1)
            const mesAlvo = alvo.getMonth() + 1, anoAlvo = alvo.getFullYear()
            const noCal = (cal || []).find((c: any) => c.mes === mesAlvo && c.data_vencimento && new Date(c.data_vencimento + 'T00:00:00').getFullYear() === anoAlvo)
            novaCobranca = noCal?.data_vencimento || alvo.toISOString().slice(0, 10)
          }
        }
      }
      const updBoleto: any = { qtd_parcelas: novaQtd, meses_cobertos: novaQtd, valor_boleto: novoValorBoleto }
      if (novaCobranca) updBoleto.data_proxima_cobranca = novaCobranca
      await supabaseAdmin.from('boletos').update(updBoleto).eq('venda_id', venda_id)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
