import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET /api/grupos/7275 → retorna dados do grupo + próximas assembleias
export async function GET(req: NextRequest, { params }: { params: Promise<{ grupo: string }> }) {
  try {
    const { grupo } = await params

    // Busca o grupo
    const { data: grupoData } = await supabaseAdmin
      .from('grupos_embracon')
      .select('*')
      .eq('grupo', grupo)
      .single()

    if (!grupoData) {
      // Grupo não mapeado — vendedor terá que informar a assembleia manualmente
      return NextResponse.json({ encontrado: false, grupo })
    }

    // Hoje
    const hoje = new Date()
    const mesAtual = hoje.getMonth() + 1

    let assembleias: { mes: number; data_assembleia: string; data_vencimento: string }[] = []

    if (grupoData.linha_calendario) {
      // Busca o calendário da linha desse grupo
      const { data: cal } = await supabaseAdmin
        .from('calendario_embracon')
        .select('mes, data_assembleia, data_vencimento')
        .eq('linha_calendario', grupoData.linha_calendario)
        .order('mes')
      if (cal) assembleias = cal
    }

    // Acha a PRÓXIMA assembleia (a partir de hoje)
    let proximaAssembleia: any = null
    for (const a of assembleias) {
      if (new Date(a.data_assembleia) >= hoje) { proximaAssembleia = a; break }
    }
    // se não achou (todas passaram no ano), pega a primeira do ano seguinte
    if (!proximaAssembleia && assembleias.length > 0) proximaAssembleia = assembleias[0]

    return NextResponse.json({
      encontrado: true,
      grupo: grupoData.grupo,
      bem: grupoData.bem,
      dia_vencimento: grupoData.dia_vencimento,
      linha_calendario: grupoData.linha_calendario,
      faixa_credito: grupoData.faixa_credito,
      data_assembleia_manual: grupoData.data_assembleia_manual,
      proxima_assembleia: proximaAssembleia?.data_assembleia || grupoData.data_assembleia_manual || null,
      proximo_vencimento: proximaAssembleia?.data_vencimento || null,
      calendario_ano: assembleias,
    })

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST /api/grupos/9999 → salva a assembleia de um grupo novo (aprendizado)
export async function POST(req: NextRequest, { params }: { params: Promise<{ grupo: string }> }) {
  try {
    const { grupo } = await params
    const body = await req.json()
    const { bem, data_assembleia, dia_vencimento, faixa_credito } = body

    if (!data_assembleia) {
      return NextResponse.json({ error: "Data da assembleia é obrigatória" }, { status: 400 })
    }

    // Determina a linha do calendário pelo dia de vencimento (se informado)
    let linha_calendario: string | null = null
    if (dia_vencimento) {
      const d = parseInt(String(dia_vencimento))
      if (d <= 12) linha_calendario = '10'
      else if (d <= 17) linha_calendario = '15'
      else if (d <= 22) linha_calendario = '20'
      else linha_calendario = '25'
    }

    const { error } = await supabaseAdmin
      .from('grupos_embracon')
      .upsert({
        grupo,
        bem: bem || null,
        dia_vencimento: dia_vencimento ? parseInt(String(dia_vencimento)) : null,
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
