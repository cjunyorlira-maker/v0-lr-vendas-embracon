import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.admin.createUser({
      email: "DIRETORIA@LRMULTIMARCAS.COM",
      password: "Master@2025!",
      email_confirm: true,
    })

    if (authError || !user) {
      return NextResponse.json({ error: authError?.message || "Erro ao criar usuário" }, { status: 400 })
    }

    const empresa = await supabase
      .from("empresas")
      .select("id")
      .eq("nome", "LR Multimarcas")
      .single()

    const { error: dbError } = await supabase
      .from("usuarios")
      .insert({
        auth_user_id: user.id,
        empresa_id: empresa.data?.id,
        nome: "Diretoria",
        email: "DIRETORIA@LRMULTIMARCAS.COM",
        role: "master",
        ativo: true,
      })

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 400 })
    }

    return NextResponse.json({ 
      success: true, 
      message: "Usuário master criado com sucesso",
      user: { email: user.email }
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
