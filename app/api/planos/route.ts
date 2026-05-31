import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("planos")
      .select("id, codigo, sigla, nome, nome_completo, bem, categoria, categoria_comissao, adesao_percent, comissao_total, comissao_parcelas, estorno_percent, estorno_ate_pgto, parcelas_nao_estornar, ativo, destaque, ordem")
      .order("ordem", { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ planos: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
