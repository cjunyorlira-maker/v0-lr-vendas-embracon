import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function GET() {
  try {
    // grupos mapeados (com info), exceto os que vão INAUGURAR
    const { data: gruposInfo } = await supabaseAdmin
      .from('assembleias_grupos_info').select('grupo, bem, proxima_assembleia')
    // linha de calendário de cada grupo
    const { data: gruposEmb } = await supabaseAdmin
      .from('grupos_embracon').select('grupo, linha_calendario')
    // calendário completo
    const { data: calendario } = await supabaseAdmin
      .from('calendario_embracon').select('linha_calendario, data_assembleia')
    // histórico já subido
    const { data: historico } = await supabaseAdmin
      .from('assembleias_historico').select('grupo, mes_referencia')
    // primeira assembleia que cada grupo realmente participou (entrada das vendas)
    const { data: vendasAssemb } = await supabaseAdmin
      .from('vendas').select('grupo, data_assembleia_entrada').not('grupo', 'is', null).not('data_assembleia_entrada', 'is', null)
    const primeiraAssembGrupo: Record<string, string> = {}
    for (const v of (vendasAssemb || [])) {
      const g = String(v.grupo).trim()
      if (!primeiraAssembGrupo[g] || v.data_assembleia_entrada < primeiraAssembGrupo[g]) {
        primeiraAssembGrupo[g] = v.data_assembleia_entrada
      }
    }

    const hoje = new Date().toISOString().slice(0, 10)
    const linhaDe: Record<string, string> = {}
    for (const g of (gruposEmb || [])) linhaDe[String(g.grupo).trim()] = g.linha_calendario
    const jaSubiu = new Set((historico || []).map(h => `${String(h.grupo).trim()}|${h.mes_referencia}`))

    const pendentes: { grupo: string; bem: string; data_assembleia: string; mes: string }[] = []
    for (const gi of (gruposInfo || [])) {
      const grupo = String(gi.grupo).trim()
      if (gi.proxima_assembleia === 'INAUGURAR') continue
      const linha = linhaDe[grupo]
      if (!linha) continue
      // a partir de quando o grupo participou (não pega assembleias de antes da entrada)
      const inicioGrupo = primeiraAssembGrupo[grupo]
      if (!inicioGrupo) continue // grupo sem venda com assembleia ainda → não cobra resultado
      // última assembleia que já aconteceu (data real do calendário), a partir da entrada do grupo
      const assembsPassadas = (calendario || [])
        .filter(c => c.linha_calendario === linha && c.data_assembleia <= hoje && c.data_assembleia >= inicioGrupo)
        .map(c => c.data_assembleia)
        .sort()
      if (assembsPassadas.length === 0) continue
      const ultima = assembsPassadas[assembsPassadas.length - 1]
      const mes = ultima.slice(0, 7)
      // se ainda não subiu o resultado desse mês → pendente
      if (!jaSubiu.has(`${grupo}|${mes}`)) {
        pendentes.push({ grupo, bem: gi.bem, data_assembleia: ultima, mes })
      }
    }
    // ordena por data de assembleia (mais antiga primeiro)
    pendentes.sort((a, b) => a.data_assembleia.localeCompare(b.data_assembleia))

    return NextResponse.json({ pendentes, total: pendentes.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
