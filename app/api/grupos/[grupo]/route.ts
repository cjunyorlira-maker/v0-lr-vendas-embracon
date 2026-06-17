import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function GET(req: NextRequest, { params }: { params: Promise<{ grupo: string }> }) {
  try {
    const { grupo } = await params

    const { data: grupoData } = await supabaseAdmin
      .from('grupos_embracon')
      .select('*')
      .eq('grupo', grupo)
      .single()

    if (!grupoData) {
      return NextResponse.json({ encontrado: false, grupo })
    }

    const hoje = new Date()

    let linhaCal = grupoData.linha_calendario
    // se o grupo não tem linha mas tem data de assembleia, deduz a linha cruzando com o calendário
    if (!linhaCal && grupoData.data_assembleia_manual) {
      const { data: match } = await supabaseAdmin
        .from('calendario_embracon')
        .select('linha_calendario')
        .eq('data_assembleia', grupoData.data_assembleia_manual)
        .limit(1)
        .single()
      if (match?.linha_calendario) linhaCal = match.linha_calendario
    }
    let calendario: { mes: number; data_assembleia: string; data_vencimento: string }[] = []
    if (linhaCal) {
      const { data: cal } = await supabaseAdmin
        .from('calendario_embracon')
        .select('mes, data_assembleia, data_vencimento')
        .eq('linha_calendario', linhaCal)
        .order('mes')
      if (cal) calendario = cal
    }

    // Próxima assembleia (Regra B): escolhe a primeira cujo VENCIMENTO ainda não passou.
    // Se o vencimento do mês já passou, o cliente não paga a 1ª parcela a tempo → vai pro mês seguinte.
    const hojeStr = hoje.toISOString().slice(0, 10)
    let proxima: any = null
    for (const a of calendario) {
      // usa o vencimento como corte; se não tiver vencimento, usa a própria assembleia
      const corte = a.data_vencimento || a.data_assembleia
      if (corte >= hojeStr) { proxima = a; break }
    }
    if (!proxima && calendario.length > 0) proxima = calendario[calendario.length - 1]

    return NextResponse.json({
      encontrado: true,
      grupo: grupoData.grupo,
      bem: grupoData.bem,
      dia_vencimento: grupoData.dia_vencimento,
      linha_calendario: linhaCal,
      faixa_credito: grupoData.faixa_credito,
      proxima_assembleia: proxima?.data_assembleia || grupoData.data_assembleia_manual || null,
      proximo_vencimento: proxima?.data_vencimento || null,
      calendario_ano: calendario,
    })

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ grupo: string }> }) {
  try {
    const { grupo } = await params
    const body = await req.json()
    const { bem, data_assembleia, data_vencimento, dia_vencimento, faixa_credito } = body

    if (!data_assembleia) {
      return NextResponse.json({ error: "Data da assembleia é obrigatória" }, { status: 400 })
    }

    // deduz dia de vencimento da data informada (se não veio explícito)
    let diaVenc = dia_vencimento ? parseInt(String(dia_vencimento)) : null
    if (!diaVenc && data_vencimento) {
      diaVenc = new Date(data_vencimento + 'T00:00:00').getDate()
    }

    let linha_calendario: string | null = null
    if (diaVenc) {
      if (diaVenc <= 12) linha_calendario = '10'
      else if (diaVenc <= 17) linha_calendario = '15'
      else if (diaVenc <= 22) linha_calendario = '20'
      else linha_calendario = '25'
    }

    const { error } = await supabaseAdmin
      .from('grupos_embracon')
      .upsert({
        grupo,
        bem: bem || null,
        dia_vencimento: diaVenc,
        linha_calendario,
        faixa_credito: faixa_credito || null,
        data_assembleia_manual: data_assembleia,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: 'grupo' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, grupo })

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
