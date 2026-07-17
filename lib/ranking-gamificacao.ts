import type { SupabaseClient } from '@supabase/supabase-js'

const firstOf = <T,>(x: T | T[] | null | undefined): T | undefined => (Array.isArray(x) ? x[0] : x || undefined)
const ROLES_NAO_VENDEDOR = ['representante', 'adm', 'master']

// ── Semana baseada em segunda-feira (índice absoluto monotônico) ──
// 2020-01-06 é uma segunda-feira; usada como época.
const EPOCH_SEG = Date.UTC(2020, 0, 6)
export function weekIndex(dateStr: string): number {
  if (!dateStr) return -1
  const d = new Date(dateStr.slice(0, 10) + 'T00:00:00Z')
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return Math.floor((day - EPOCH_SEG) / (7 * 86400000))
}
function isoDate(ms: number) { return new Date(ms).toISOString().slice(0, 10) }
export function weekRange(idx: number) {
  const mon = EPOCH_SEG + idx * 7 * 86400000
  return { ini: isoDate(mon), fim: isoDate(mon + 6 * 86400000) }
}

// Busca paginada (Supabase limita 1000 linhas por request)
async function fetchAll(admin: SupabaseClient, build: (q: any) => any) {
  const out: any[] = []
  let from = 0
  const size = 1000
  for (;;) {
    const { data, error } = await build(admin.from('vendas')).range(from, from + size - 1)
    if (error || !data || data.length === 0) break
    out.push(...data)
    if (data.length < size) break
    from += size
  }
  return out
}

export interface Gamificacao {
  rei_semana: {
    geral: { vendedor_id: string; nome: string; foto?: string; valor: number } | null
    por_empresa: Record<string, { vendedor_id: string; nome: string; foto?: string; valor: number }>
    datas: { ini: string; fim: string }
  }
  semana_atual_lider: { vendedor_id: string; nome: string; valor: number } | null
  streaks: Record<string, number>       // vendedor_id -> semanas consecutivas
  reis_ids: string[]                     // ids marcados como rei (geral + por empresa)
  recordes: {
    maior_venda_unica: { vendedor: string; cliente: string; valor: number; data: string } | null
    melhor_semana_individual: { vendedor: string; valor: number; datas: { ini: string; fim: string } } | null
    melhor_producao_equipe: { equipe: string; producao: string; valor: number } | null
    melhor_producao_individual: { vendedor: string; foto?: string; equipe?: string; empresa?: string; producao: string; valor: number } | null
    contemplacao_mais_rapida: { cliente: string; dias: number; data_venda: string; data_assembleia: string } | null
  }
}

export async function calcularGamificacao(
  admin: SupabaseClient,
  producoes: { id: string; nome: string; data_inicio: string; data_fim: string }[]
): Promise<Gamificacao> {
  // Histórico completo de vendas (paginado)
  const historico = await fetchAll(admin, (q) =>
    q.select('valor_credito, vendedor_id, equipe_id, empresa_id, data_venda, usuarios:vendedor_id(nome, foto_url, role), equipes(nome), empresas(nome), clientes(nome)')
  )

  const hojeIdx = weekIndex(new Date().toISOString().slice(0, 10))
  const prevIdx = hojeIdx - 1

  // agregadores
  const semanaPrevGeral = new Map<string, { vendedor_id: string; nome: string; foto?: string; valor: number }>()
  const semanaPrevEmp = new Map<string, Map<string, { vendedor_id: string; nome: string; foto?: string; valor: number }>>()
  const semanaAtual = new Map<string, { vendedor_id: string; nome: string; valor: number }>()
  const semanasPorVend = new Map<string, Set<number>>()          // streak
  const somaVendWeek = new Map<string, { vendedor: string; valor: number; idx: number }>()
  const prodEquipe = new Map<string, { equipe: string; producao: string; valor: number }>()
  const vendProd = new Map<string, { vendedor: string; foto?: string; equipe?: string; empresa?: string; producao: string; valor: number }>() // recorde de melhor produção individual
  let maiorVenda: Gamificacao['recordes']['maior_venda_unica'] = null

  const achaProducao = (dataStr: string) => producoes.find(p => p.data_inicio <= dataStr && p.data_fim >= dataStr)

  for (const v of historico) {
    const cred = v.valor_credito || 0
    const u = firstOf<any>(v.usuarios)
    const emp = v.empresa_id
    const eq = firstOf<any>(v.equipes)
    const cli = firstOf<any>(v.clientes)
    const ehRep = u && ROLES_NAO_VENDEDOR.includes(u.role)
    const idx = weekIndex(v.data_venda)

    // maior venda única (qualquer vendedor real)
    if (!ehRep && (!maiorVenda || cred > maiorVenda.valor)) {
      maiorVenda = { vendedor: u?.nome || '—', cliente: cli?.nome || '—', valor: cred, data: v.data_venda }
    }

    if (v.vendedor_id && !ehRep) {
      // rei da semana anterior
      if (idx === prevIdx) {
        const g = semanaPrevGeral.get(v.vendedor_id) || { vendedor_id: v.vendedor_id, nome: u?.nome || 'Vendedor', foto: u?.foto_url, valor: 0 }
        g.valor += cred; semanaPrevGeral.set(v.vendedor_id, g)
        if (emp) {
          if (!semanaPrevEmp.has(emp)) semanaPrevEmp.set(emp, new Map())
          const m = semanaPrevEmp.get(emp)!
          const e = m.get(v.vendedor_id) || { vendedor_id: v.vendedor_id, nome: u?.nome || 'Vendedor', foto: u?.foto_url, valor: 0 }
          e.valor += cred; m.set(v.vendedor_id, e)
        }
      }
      // líder da semana atual
      if (idx === hojeIdx) {
        const a = semanaAtual.get(v.vendedor_id) || { vendedor_id: v.vendedor_id, nome: u?.nome || 'Vendedor', valor: 0 }
        a.valor += cred; semanaAtual.set(v.vendedor_id, a)
      }
      // streak: semanas com venda
      if (!semanasPorVend.has(v.vendedor_id)) semanasPorVend.set(v.vendedor_id, new Set())
      semanasPorVend.get(v.vendedor_id)!.add(idx)
      // melhor semana individual (soma por vendedor+semana)
      const wk = `${v.vendedor_id}|${idx}`
      const s = somaVendWeek.get(wk) || { vendedor: u?.nome || 'Vendedor', valor: 0, idx }
      s.valor += cred; somaVendWeek.set(wk, s)
      // recorde de melhor produção individual (soma por vendedor+produção)
      const prodV = achaProducao(v.data_venda)
      if (prodV) {
        const pk = `${v.vendedor_id}|${prodV.id}`
        const vp = vendProd.get(pk) || { vendedor: u?.nome || 'Vendedor', foto: u?.foto_url, equipe: eq?.nome, empresa: firstOf<any>(v.empresas)?.nome, producao: prodV.nome, valor: 0 }
        vp.valor += cred
        if (eq?.nome) vp.equipe = eq.nome
        vendProd.set(pk, vp)
      }
    }

    // melhor produção de equipe (soma por produção+equipe)
    if (v.equipe_id) {
      const prod = achaProducao(v.data_venda)
      if (prod) {
        const key = `${prod.id}|${v.equipe_id}`
        const pe = prodEquipe.get(key) || { equipe: eq?.nome || 'Equipe', producao: prod.nome, valor: 0 }
        pe.valor += cred; prodEquipe.set(key, pe)
      }
    }
  }

  const topMap = <T extends { valor: number }>(m: Map<string, T>) => Array.from(m.values()).sort((a, b) => b.valor - a.valor)[0] || null

  // rei geral + por empresa
  const reiGeral = topMap(semanaPrevGeral)
  const reiPorEmpresa: Record<string, any> = {}
  const reisIds = new Set<string>()
  if (reiGeral) reisIds.add(reiGeral.vendedor_id)
  for (const [empId, m] of semanaPrevEmp) {
    const top = topMap(m)
    if (top) { reiPorEmpresa[empId] = top; reisIds.add(top.vendedor_id) }
  }

  // streaks consecutivos terminando na semana atual ou anterior
  const streaks: Record<string, number> = {}
  for (const [vid, weeks] of semanasPorVend) {
    let end = weeks.has(hojeIdx) ? hojeIdx : (weeks.has(prevIdx) ? prevIdx : null)
    if (end === null) { streaks[vid] = 0; continue }
    let count = 0
    while (weeks.has(end - count)) count++
    streaks[vid] = count
  }

  // melhor semana individual
  let melhorSemana: Gamificacao['recordes']['melhor_semana_individual'] = null
  for (const s of somaVendWeek.values()) {
    if (!melhorSemana || s.valor > melhorSemana.valor) melhorSemana = { vendedor: s.vendedor, valor: s.valor, datas: weekRange(s.idx) }
  }

  const melhorProdEquipe = topMap(prodEquipe)

  // melhor produção individual (maior soma de um vendedor em uma única produção)
  let melhorProdIndiv: Gamificacao['recordes']['melhor_producao_individual'] = null
  for (const vp of vendProd.values()) {
    if (!melhorProdIndiv || vp.valor > melhorProdIndiv.valor) melhorProdIndiv = vp
  }

  // contemplação mais rápida (lances_mensais.contemplado = true)
  let contemplacao: Gamificacao['recordes']['contemplacao_mais_rapida'] = null
  try {
    const { data: lancesC } = await admin
      .from('lances_mensais')
      .select('lance_config_id, data_assembleia, cliente_id')
      .eq('contemplado', true)
      .not('data_assembleia', 'is', null)
    const configIds = Array.from(new Set((lancesC || []).map((l: any) => l.lance_config_id).filter(Boolean)))
    if (configIds.length) {
      const { data: configs } = await admin.from('lances_config').select('id, venda_id').in('id', configIds)
      const cfgToVenda = new Map<string, string>((configs || []).map((c: any) => [c.id, c.venda_id]))
      const vendaIds = Array.from(new Set((configs || []).map((c: any) => c.venda_id).filter(Boolean)))
      if (vendaIds.length) {
        const { data: vds } = await admin.from('vendas').select('id, data_venda, clientes(nome)').in('id', vendaIds)
        const vinfo = new Map<string, any>((vds || []).map((v: any) => [v.id, v]))
        for (const l of (lancesC || [])) {
          const vid = cfgToVenda.get(l.lance_config_id)
          const vd = vid ? vinfo.get(vid) : null
          if (!vd?.data_venda || !l.data_assembleia) continue
          const dias = Math.round((new Date(l.data_assembleia).getTime() - new Date(vd.data_venda).getTime()) / 86400000)
          if (dias < 0) continue
          if (!contemplacao || dias < contemplacao.dias) {
            contemplacao = { cliente: firstOf<any>(vd.clientes)?.nome || '—', dias, data_venda: vd.data_venda, data_assembleia: l.data_assembleia }
          }
        }
      }
    }
  } catch { /* ignora se as tabelas de lances não retornarem */ }

  return {
    rei_semana: { geral: reiGeral, por_empresa: reiPorEmpresa, datas: weekRange(prevIdx) },
    semana_atual_lider: topMap(semanaAtual),
    streaks,
    reis_ids: Array.from(reisIds),
    recordes: {
      maior_venda_unica: maiorVenda,
      melhor_semana_individual: melhorSemana,
      melhor_producao_equipe: melhorProdEquipe,
      melhor_producao_individual: melhorProdIndiv,
      contemplacao_mais_rapida: contemplacao,
    },
  }
}

// ── Ultrapassagens: notifica quem foi passado no ranking da produção corrente ──
export async function processarUltrapassagens(
  admin: SupabaseClient,
  producaoId: string,
  rankingAtual: { vendedor_id: string; nome: string; posicao: number; valor: number }[]
) {
  const atuais = rankingAtual.filter(r => r.vendedor_id)
  if (atuais.length === 0) return

  // snapshot anterior desta produção
  const { data: snapRaw } = await admin
    .from('ranking_snapshot')
    .select('vendedor_id, posicao, valor')
    .eq('producao_id', producaoId)
  const snap = new Map<string, number>((snapRaw || []).map((s: any) => [s.vendedor_id, s.posicao]))
  const posAtual = new Map<string, number>(atuais.map(r => [r.vendedor_id, r.posicao]))

  if (snap.size > 0) {
    // destinatários que já receberam ultrapassagem nas últimas 24h → pular
    const desde = new Date(Date.now() - 24 * 3600000).toISOString()
    const { data: recentes } = await admin
      .from('notificacoes')
      .select('destinatario_id')
      .eq('tipo', 'ultrapassagem')
      .gte('criado_em', desde)
    const jaNotificado = new Set<string>((recentes || []).map((n: any) => n.destinatario_id).filter(Boolean))

    const notifs: any[] = []
    const top10 = atuais.filter(r => r.posicao <= 10)
    for (const a of top10) {
      const posAntesA = snap.get(a.vendedor_id)
      if (posAntesA === undefined || a.posicao >= posAntesA) continue // não melhorou
      // quem A ultrapassou: estava à frente antes (pos menor) e agora está atrás (pos maior)
      for (const b of atuais) {
        if (b.vendedor_id === a.vendedor_id) continue
        const posAntesB = snap.get(b.vendedor_id)
        const posAgoraB = posAtual.get(b.vendedor_id)
        if (posAntesB === undefined || posAgoraB === undefined) continue
        const estavaFrente = posAntesB < posAntesA
        const agoraAtras = a.posicao < posAgoraB
        if (estavaFrente && agoraAtras && !jaNotificado.has(b.vendedor_id)) {
          notifs.push({
            destinatario_id: b.vendedor_id,
            titulo: '⚔️ Você foi ultrapassado!',
            mensagem: `${a.nome} acabou de te passar no ranking! Ele está com ${(a.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}.`,
            tipo: 'ultrapassagem',
            link_url: '/ranking',
          })
          jaNotificado.add(b.vendedor_id) // no máximo uma por destinatário por execução
        }
      }
    }
    if (notifs.length > 0) { try { await admin.from('notificacoes').insert(notifs) } catch {} }
  }

  // upsert do snapshot atual (delete + insert desta produção)
  try {
    await admin.from('ranking_snapshot').delete().eq('producao_id', producaoId)
    const rows = atuais.map(r => ({ vendedor_id: r.vendedor_id, posicao: r.posicao, valor: r.valor, producao_id: producaoId, atualizado_em: new Date().toISOString() }))
    if (rows.length) await admin.from('ranking_snapshot').insert(rows)
  } catch { /* ignora falha de snapshot */ }
}
