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
  if (min > max) return false // faixa com dado inconsistente
  return credito >= min && credito <= max
}

export async function GET(req: NextRequest) {
  try {
    const bem = req.nextUrl.searchParams.get('bem')
    const credito = parseInt(req.nextUrl.searchParams.get('credito') || '0', 10)
    if (!bem || !credito) return NextResponse.json({ error: "bem e crédito obrigatórios" }, { status: 400 })

    // 1) grupos do mesmo bem cuja faixa de crédito contém o valor simulado
    const { data: grupos } = await supabaseAdmin
      .from('grupos_embracon')
      .select('grupo, bem, faixa_credito')
      .eq('bem', bem)
    const candidatos = (grupos || []).filter(g => faixaContem(g.faixa_credito, credito))
    if (candidatos.length === 0) return NextResponse.json({ encontrado: false })

    const gruposIds = candidatos.map(g => String(g.grupo).trim())

    // 2) resultado de assembleia mais recente de cada candidato (mais contemplações vence)
    const { data: hist } = await supabaseAdmin
      .from('assembleias_historico')
      .select('grupo, mes_referencia, mes_label, numero_assembleia, sorteio_qt, lance_livre_qt, lance_fixo_50_qt, lance_fixo_25_qt, total_contemplados')
      .in('grupo', gruposIds)
      .order('mes_referencia', { ascending: false })

    const ultimaPorGrupo: Record<string, any> = {}
    for (const h of (hist || [])) {
      const g = String(h.grupo).trim()
      if (!ultimaPorGrupo[g]) ultimaPorGrupo[g] = h // primeira = mais recente (ordenado desc)
    }

    // escolhe o grupo com MAIS contemplações na última assembleia; se nenhum
    // tiver histórico, cai no primeiro candidato (ainda mostra próxima assembleia)
    let escolhido = candidatos[0]
    let melhor = -1
    for (const c of candidatos) {
      const u = ultimaPorGrupo[String(c.grupo).trim()]
      const tot = u?.total_contemplados ?? -1
      if (tot > melhor) { melhor = tot; escolhido = c }
    }
    const grupoId = String(escolhido.grupo).trim()
    const ultima = ultimaPorGrupo[grupoId] || null

    // 3) próxima assembleia (mesma regra das outras telas: 1º vencimento futuro)
    const { data: cal } = await supabaseAdmin
      .from('calendario_grupo')
      .select('data_assembleia, data_vencimento')
      .eq('grupo', grupoId)
      .order('data_assembleia')
    const hojeStr = new Date().toISOString().slice(0, 10)
    let proxima: any = null
    for (const c of (cal || [])) {
      const corte = c.data_vencimento || c.data_assembleia
      if (corte >= hojeStr) { proxima = c; break }
    }
    if (!proxima && (cal || []).length > 0) proxima = cal![cal!.length - 1]

    // 4) extrato disponível no storage?
    const { data: ext } = await supabaseAdmin
      .from('extratos_grupo')
      .select('arquivo_path')
      .eq('grupo', grupoId)
      .maybeSingle()

    const sorteio = ultima?.sorteio_qt ?? 0
    const totalContempl = ultima?.total_contemplados ?? 0
    const lance = Math.max(0, totalContempl - sorteio)

    return NextResponse.json({
      encontrado: true,
      grupo: escolhido.grupo,
      bem: escolhido.bem,
      faixa_credito: escolhido.faixa_credito,
      qtd_grupos_faixa: candidatos.length,
      ultima_assembleia: ultima ? {
        label: ultima.mes_label,
        numero: ultima.numero_assembleia,
        total_contemplados: totalContempl,
        sorteio,
        lance,
      } : null,
      proxima_assembleia: proxima?.data_assembleia || null,
      tem_extrato: !!ext?.arquivo_path,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
