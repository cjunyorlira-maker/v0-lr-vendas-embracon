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
    const { data: me } = await supabaseAdmin.from('usuarios').select('id, role, empresa_id').eq('auth_user_id', authUser.id).single()
    if (!me || !['master', 'representante', 'adm'].includes(me.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 })

    const mapaId = req.nextUrl.searchParams.get('mapa_id')

    // logo da empresa
    let logoUrl: string | null = null, empresaNome = ''
    if (me.empresa_id) {
      const { data: emp } = await supabaseAdmin.from('empresas').select('nome, logo_url').eq('id', me.empresa_id).single()
      logoUrl = emp?.logo_url || null; empresaNome = emp?.nome || ''
    }

    // lista de mapas (histórico)
    const { data: mapas } = await supabaseAdmin.from('mapas_comissao').select('*').order('data_encerramento', { ascending: false })

    // se pediu um mapa específico, traz as linhas organizadas por cliente
    let detalhe = null
    if (mapaId) {
      const { data: linhas } = await supabaseAdmin.from('mapa_linhas').select('contrato, consorciado, percentual_comis, parcela_de, parcela_ate, valor_comissao').eq('mapa_id', mapaId)
      const { escopoGlobal } = await getEscopo(me)
      // cruza os contratos com as vendas pra pegar nome do cliente E a empresa de cada contrato
      const contratos = [...new Set((linhas || []).map((l: any) => String(l.contrato)))]
      const nomePorContrato: Record<string, string> = {}
      const empresaPorContrato: Record<string, string> = {}
      if (contratos.length > 0) {
        const { data: vendas } = await supabaseAdmin.from('vendas').select('numero_contrato, numero_proposta, empresa_id, clientes(nome)').or(`numero_contrato.in.(${contratos.join(',')}),numero_proposta.in.(${contratos.join(',')})`)
        for (const v of (vendas || [])) {
          const nome = Array.isArray(v.clientes) ? v.clientes[0]?.nome : (v.clientes as any)?.nome
          if (v.numero_contrato) { nomePorContrato[String(v.numero_contrato)] = nome || ''; empresaPorContrato[String(v.numero_contrato)] = v.empresa_id }
          if (v.numero_proposta) { nomePorContrato[String(v.numero_proposta)] = nome || ''; empresaPorContrato[String(v.numero_proposta)] = v.empresa_id }
        }
      }
      // filtra: se NÃO for escopo global, só mostra contratos cuja venda é da empresa do usuário
      const linhasFiltradas = (linhas || []).filter((l: any) => {
        if (escopoGlobal) return true
        return empresaPorContrato[String(l.contrato)] === me.empresa_id
      })
      // agrupa por contrato, montando uma linha resumo por cliente (já filtrado por empresa)
      const porCliente: Record<string, any> = {}
      for (const l of linhasFiltradas) {
        const chave = String(l.contrato)
        if (!porCliente[chave]) porCliente[chave] = { contrato: l.contrato, cliente: nomePorContrato[chave] || l.consorciado || 'Não cadastrado', parcelas: [], percentualTotal: 0, total: 0, empresa_id: empresaPorContrato[chave] || null, casada: !!nomePorContrato[String(l.contrato)] }
        // lista de parcelas (de-ate)
        for (let p = l.parcela_de; p <= l.parcela_ate; p++) porCliente[chave].parcelas.push(p)
        porCliente[chave].percentualTotal += l.percentual_comis
        porCliente[chave].total += l.valor_comissao
      }
      const clientes = Object.values(porCliente).map((c: any) => ({ ...c, parcelas: [...new Set(c.parcelas)].sort((a: any, b: any) => a - b) }))
      const totalGeral = clientes.reduce((s: number, c: any) => s + c.total, 0)
      detalhe = { clientes, totalGeral }
    }

    return NextResponse.json({ mapas: mapas || [], detalhe, logo_url: logoUrl, empresa_nome: empresaNome })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
