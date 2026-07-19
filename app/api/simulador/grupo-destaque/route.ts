import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// "30.000 a 60.000" -> [30000, 60000]; testa se o crédito cabe na faixa
function faixaContem(faixa: string | null, credito: number): boolean {
  if (!faixa) return false
  const nums = (faixa.match(/[\d.]+/g) || []).map(x => parseInt(x.replace(/\./g, ''), 10)).filter(n => !isNaN(n))
  if (nums.length < 2) return false
  const [min, max] = nums
  if (min > max) return false
  return credito >= min && credito <= max
}

export async function GET(req: NextRequest) {
  try {
    const bem = req.nextUrl.searchParams.get('bem')
    const credito = parseInt(req.nextUrl.searchParams.get('credito') || '0', 10)
    if (!bem || !credito) return NextResponse.json({ error: "bem e crédito obrigatórios" }, { status: 400 })

    // 1) grupos do mesmo bem cuja faixa de crédito contém o valor simulado
    const { data: infos } = await supabaseAdmin
      .from('assembleias_grupos_info')
      .select('grupo, bem, faixa_credito, proxima_assembleia')
      .eq('bem', bem)
    const candidatos = (infos || []).filter(g => faixaContem(g.faixa_credito, credito))
    if (candidatos.length === 0) return NextResponse.json({ encontrado: false })

    const gruposIds = candidatos.map(g => String(g.grupo).trim())

    // 2) resultado de assembleia mais recente de cada candidato (por mes_referencia desc)
    const { data: hist } = await supabaseAdmin
      .from('assembleias_historico')
      .select('grupo, mes_referencia, mes_label, numero_assembleia, sorteio_qt, lance_livre_qt, lance_fixo_50_qt, lance_fixo_25_qt, lance_livre_menor, total_contemplados')
      .in('grupo', gruposIds)
      .order('mes_referencia', { ascending: false })

    const ultimaPorGrupo: Record<string, any> = {}
    for (const h of (hist || [])) {
      const g = String(h.grupo).trim()
      if (!ultimaPorGrupo[g]) ultimaPorGrupo[g] = h // primeira = mais recente
    }

    // campeão = maior total_contemplados na última assembleia; sem histórico cai no 1º candidato
    let escolhido = candidatos[0]
    let melhor = -1
    for (const c of candidatos) {
      const u = ultimaPorGrupo[String(c.grupo).trim()]
      const tot = u?.total_contemplados ?? -1
      if (tot > melhor) { melhor = tot; escolhido = c }
    }
    const grupoId = String(escolhido.grupo).trim()
    const ultima = ultimaPorGrupo[grupoId] || null

    // 3) extrato disponível no storage?
    const { data: ext } = await supabaseAdmin
      .from('extratos_grupo')
      .select('arquivo_path')
      .eq('grupo', grupoId)
      .maybeSingle()

    const lanceFixo = (ultima?.lance_fixo_50_qt ?? 0) + (ultima?.lance_fixo_25_qt ?? 0)
    // lance_livre_menor é fração (0.78 = 78%); converte para percentual exibível
    const menorRaw = ultima?.lance_livre_menor != null ? Number(ultima.lance_livre_menor) : null
    const lanceLivreMenorPct = menorRaw != null && !isNaN(menorRaw) ? Math.round(menorRaw * 100 * 10) / 10 : null

    return NextResponse.json({
      encontrado: true,
      grupo: escolhido.grupo,
      bem: escolhido.bem,
      faixa_credito: escolhido.faixa_credito,
      qtd_grupos_faixa: candidatos.length,
      ultima_assembleia: ultima ? {
        label: ultima.mes_label,
        numero: ultima.numero_assembleia,
        total_contemplados: ultima.total_contemplados ?? 0,
        sorteio_qt: ultima.sorteio_qt ?? 0,
        lance_livre_qt: ultima.lance_livre_qt ?? 0,
        lance_fixo_qt: lanceFixo,
        lance_fixo_50_qt: ultima.lance_fixo_50_qt ?? 0,
        lance_fixo_25_qt: ultima.lance_fixo_25_qt ?? 0,
        lance_livre_menor_pct: lanceLivreMenorPct,
      } : null,
      proxima_assembleia: escolhido.proxima_assembleia || null,
      tem_extrato: !!ext?.arquivo_path,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
