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
    // grupos onde a LR tem cliente (no geral)
    const { data: vendasCli } = await supabaseAdmin
      .from('vendas').select('grupo').not('grupo', 'is', null).not('cliente_id', 'is', null)
    const gruposComCliente = new Set<string>()
    for (const v of (vendasCli || [])) {
      const g = String(v.grupo).trim(); if (g) gruposComCliente.add(g)
    }

    // calendário oficial exato por grupo
    const { data: calTodos } = await supabaseAdmin
      .from('calendario_grupo').select('grupo, data_assembleia')
      .order('data_assembleia')

    // bem de cada grupo (pro label)
    const { data: gruposInfo } = await supabaseAdmin
      .from('assembleias_grupos_info').select('grupo, bem')
    const bemDe: Record<string, string> = {}
    for (const gi of (gruposInfo || [])) bemDe[String(gi.grupo).trim()] = gi.bem

    // histórico já subido
    const { data: historico } = await supabaseAdmin
      .from('assembleias_historico').select('grupo, mes_referencia')
    const jaSubiu = new Set((historico || []).map(h => `${String(h.grupo).trim()}|${h.mes_referencia}`))

    const hoje = new Date().toISOString().slice(0, 10)

    // pra cada grupo com cliente, acha a ÚLTIMA assembleia que já passou (data exata)
    const ultimaPassada: Record<string, string> = {}
    for (const c of (calTodos || [])) {
      const g = String(c.grupo).trim()
      if (!gruposComCliente.has(g)) continue
      if (c.data_assembleia <= hoje) {
        if (!ultimaPassada[g] || c.data_assembleia > ultimaPassada[g]) {
          ultimaPassada[g] = c.data_assembleia
        }
      }
    }

    // pendente = última assembleia passada cujo resultado do mês ainda não foi subido
    const pendentes: { grupo: string; bem: string; data_assembleia: string; mes: string }[] = []
    for (const g of Object.keys(ultimaPassada)) {
      const ultima = ultimaPassada[g]
      const mes = ultima.slice(0, 7)
      if (!jaSubiu.has(`${g}|${mes}`)) {
        pendentes.push({ grupo: g, bem: bemDe[g] || '-', data_assembleia: ultima, mes })
      }
    }
    pendentes.sort((a, b) => a.data_assembleia.localeCompare(b.data_assembleia))

    return NextResponse.json({ pendentes, total: pendentes.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
