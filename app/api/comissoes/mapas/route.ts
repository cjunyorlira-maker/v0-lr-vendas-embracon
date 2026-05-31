import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

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
      // agrupa por contrato/cliente
      const porCliente: Record<string, any> = {}
      for (const l of (linhas || [])) {
        const chave = l.contrato
        if (!porCliente[chave]) porCliente[chave] = { contrato: l.contrato, cliente: l.consorciado, linhas: [], total: 0 }
        porCliente[chave].linhas.push({ percentual: l.percentual_comis, parcela_de: l.parcela_de, parcela_ate: l.parcela_ate, valor: l.valor_comissao })
        porCliente[chave].total += l.valor_comissao
      }
      const clientes = Object.values(porCliente)
      const totalGeral = clientes.reduce((s: number, c: any) => s + c.total, 0)
      detalhe = { clientes, totalGeral }
    }

    return NextResponse.json({ mapas: mapas || [], detalhe, logo_url: logoUrl, empresa_nome: empresaNome })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
