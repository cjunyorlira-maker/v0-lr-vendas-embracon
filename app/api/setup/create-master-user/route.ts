import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    // Usa signUp normal (não precisa de service role)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    
    const { data, error: authError } = await supabase.auth.signUp({
      email: "DIRETORIA@LRMULTIMARCAS.COM",
      password: "Master@2025!",
      options: {
        data: {
          role: "master",
          nome: "Diretoria"
        }
      }
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    if (!data.user) {
      return NextResponse.json({ error: "Usuário não criado" }, { status: 400 })
    }

    // Busca empresa LR Multimarcas
    const { data: empresa } = await supabase
      .from("empresas")
      .select("id")
      .eq("nome", "LR Multimarcas")
      .single()

    // Insere na tabela usuarios
    const { error: dbError } = await supabase
      .from("usuarios")
      .insert({
        auth_user_id: data.user.id,
        empresa_id: empresa?.id,
        nome: "Diretoria",
        email: "DIRETORIA@LRMULTIMARCAS.COM",
        role: "master",
        ativo: true,
      })

    if (dbError) {
      console.log("[v0] Erro ao inserir usuario:", dbError.message)
    }

    return NextResponse.json({ 
      success: true, 
      message: "Usuário master criado! Verifique o email para confirmar ou desative confirmação no Supabase.",
      user: { id: data.user.id, email: data.user.email },
      needsEmailConfirmation: !data.session
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
