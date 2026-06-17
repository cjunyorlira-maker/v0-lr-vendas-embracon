import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

export const runtime = 'nodejs'

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

    const grupo = req.nextUrl.searchParams.get('grupo')
    if (!grupo) return NextResponse.json({ error: "Grupo não informado" }, { status: 400 })

    const { data: ext } = await supabaseAdmin.from('extratos_grupo').select('arquivo_path, arquivo_nome').eq('grupo', grupo).maybeSingle()
    if (!ext?.arquivo_path) return NextResponse.json({ error: "Esse grupo não tem extrato" }, { status: 404 })

    const { data: signed, error } = await supabaseAdmin.storage
      .from('extratos-grupo')
      .createSignedUrl(ext.arquivo_path, 60, { download: ext.arquivo_nome || true })
    if (error || !signed) return NextResponse.json({ error: "Erro ao gerar link" }, { status: 500 })

    return NextResponse.json({ url: signed.signedUrl, nome: ext.arquivo_nome })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
