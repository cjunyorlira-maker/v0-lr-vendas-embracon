import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

// pdf-parse precisa do runtime Node.js (não funciona no Edge)
export const runtime = 'nodejs'
export const maxDuration = 30

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

function parseNum(s: string): number {
  if (!s) return 0
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
}

// extrai data dd/mm/yyyy -> yyyy-mm-dd
function dataISO(s: string): string | null {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )
    const { data: { user: authUser } } = await supabaseUser.auth.getUser()
    if (!authUser) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

    const { data: me } = await supabaseAdmin
      .from('usuarios').select('id, role, empresa_id').eq('auth_user_id', authUser.id).single()
    if (!me || !['master', 'representante', 'adm'].includes(me.role)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: "Nenhum arquivo" }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    let texto = ''
    try {
      const pdfParse = (await import('pdf-parse')).default
      function renderPage(pageData: any) {
        const opts = { normalizeWhitespace: false, disableCombineTextItems: false }
        return pageData.getTextContent(opts).then((tc: any) => {
          let lastY: number | undefined, txt = ''
          for (const item of tc.items) {
            if (lastY === item.transform[5] || lastY === undefined) txt += item.str + ' '
            else txt += '\n' + item.str + ' '
            lastY = item.transform[5]
          }
          return txt
        })
      }
      const parsed = await pdfParse(buffer, { pagerender: renderPage })
      texto = (parsed.text || '').replace(/\u00a0/g, ' ')
    } catch (e) {
      return NextResponse.json({ error: "Não consegui ler o PDF do mapa: " + String(e) }, { status: 400 })
    }
    if (!texto || texto.trim().length < 20) {
      return NextResponse.json({ error: "PDF vazio ou ilegível" }, { status: 400 })
    }

    // data de encerramento
    const dataEnc = dataISO((texto.match(/Encerramento de:\s*(\d{2}\/\d{2}\/\d{4})/) || [])[1] || '')

    // Cada linha do mapa segue o padrão:
    // 28/05/2026 25/05/2026 25/05/2026 112520 IE400 9881377 007275-2913-00 A 1 1 006058 000085 0000043604 1,0000 400.000,00 4.000,00 0,00 ...
    // Regex: data data data equipe bem CONTRATO consorciado ger PCL_DE PCL_ATE regra categ usuario %COMIS CALC $COMISSAO
    const linhas: any[] = []
    // normaliza espaços (pdf-parse pode usar espaços/quebras variados)
    const textoNorm = texto.replace(/\s+/g, ' ')

    // Vários padrões pra tolerar como o PDF foi extraído.
    // Âncora: CONTRATO(6-8díg) CONSORCIADO(xxxxxx-xxxx-xx) ... %COMIS+A Pcl_de Pcl_ate CALC $COMISSAO
    const padroes = [
      /(\d{6,8}) (\d{6}-\d{4}-\d{2}) \d+ \d+ ([\d,]+)A (\d+) (\d+) ([\d.,]+) ([\d.,]+)/g,
      /(\d{6,8}) (\d{6}-\d{4}-\d{2}) \d+ \d+ ([\d,]+)\s*A\s*(\d+)\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)/g,
      /(\d{6,8})\s+(\d{6}-\d{4}-\d{2}).*?([\d,]+)A\s*(\d+)\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)/g,
    ]

    for (const padrao of padroes) {
      let m
      const tmp: any[] = []
      while ((m = padrao.exec(textoNorm)) !== null) {
        tmp.push({
          contrato: m[1],
          consorciado: m[2],
          percentual_comis: parseNum(m[3]),
          parcela_de: parseInt(m[4]),
          parcela_ate: parseInt(m[5]),
          calc_comis: parseNum(m[6]),
          valor_comissao: parseNum(m[7]),
          bem: null,
          valor_estorno: 0,
        })
      }
      if (tmp.length > 0) { linhas.push(...tmp); break }
    }

    if (linhas.length === 0) {
      // retorna um trecho do texto pra diagnosticar como o PDF foi extraído
      return NextResponse.json({
        error: "Não consegui ler linhas do mapa. Veja a amostra do texto extraído abaixo e me envie.",
        amostra_texto: textoNorm.slice(0, 1200),
      }, { status: 400 })
    }

    // Remove mapas anteriores do mesmo período de encerramento (evita duplicar ao reimportar)
    if (dataEnc) {
      const { data: mapasAntigos } = await supabaseAdmin.from('mapas_comissao').select('id').eq('data_encerramento', dataEnc)
      if (mapasAntigos && mapasAntigos.length > 0) {
        const ids = mapasAntigos.map((mp: any) => mp.id)
        await supabaseAdmin.from('mapa_linhas').delete().in('mapa_id', ids)
        await supabaseAdmin.from('mapas_comissao').delete().in('id', ids)
      }
    }

    // Cria o registro do mapa
    const totalComissao = linhas.reduce((s, l) => s + l.valor_comissao, 0)
    const contratosUnicos = new Set(linhas.map(l => l.contrato))
    const { data: mapa, error: mapaErr } = await supabaseAdmin.from('mapas_comissao').insert({
      empresa_id: me.role === 'master' ? null : me.empresa_id,
      data_encerramento: dataEnc,
      total_contratos: contratosUnicos.size,
      total_comissao: totalComissao,
      arquivo_nome: file.name,
      importado_por: me.id,
    }).select('id').single()
    if (mapaErr || !mapa) return NextResponse.json({ error: mapaErr?.message || 'Erro ao criar mapa' }, { status: 500 })

    // Busca todas as vendas pra cruzar por contrato
    const { data: vendas } = await supabaseAdmin
      .from('vendas')
      .select('id, numero_contrato, numero_proposta, valor_credito, plano_id, planos(comissao_total)')

    const vendaPorContrato = new Map<string, any>()
    for (const v of (vendas || []) as any[]) {
      if (v.numero_contrato) vendaPorContrato.set(String(v.numero_contrato), v)
      if (v.numero_proposta) vendaPorContrato.set(String(v.numero_proposta), v)
    }

    // Insere as linhas + agrupa por contrato pra calcular recebido
    const recebidoPorContrato = new Map<string, number>()
    const linhasInsert = linhas.map(l => {
      const venda = vendaPorContrato.get(l.contrato)
      recebidoPorContrato.set(l.contrato, (recebidoPorContrato.get(l.contrato) || 0) + l.valor_comissao)
      return { ...l, mapa_id: mapa.id, empresa_id: me.role === 'master' ? null : me.empresa_id, venda_id: venda?.id || null }
    })
    // dedup: remove linhas idênticas (mesmo contrato + parcela + valor)
    const vistas = new Set<string>()
    const linhasUnicas = linhasInsert.filter(l => {
      const chave = `${l.contrato}|${l.parcela_de}|${l.parcela_ate}|${l.valor_comissao}`
      if (vistas.has(chave)) return false
      vistas.add(chave)
      return true
    })
    await supabaseAdmin.from('mapa_linhas').insert(linhasUnicas)

    // RECALCULA DO ZERO: varre TODAS as linhas de TODOS os mapas e recruza com TODAS as vendas
    // Assim funciona mesmo que a venda tenha sido cadastrada depois do mapa
    const { data: todasLinhas } = await supabaseAdmin.from('mapa_linhas').select('contrato, valor_comissao')

    // soma o recebido por contrato (todos os mapas)
    const recebidoTotalPorContrato = new Map<string, number>()
    for (const l of (todasLinhas || []) as any[]) {
      const c = String(l.contrato).trim()
      recebidoTotalPorContrato.set(c, (recebidoTotalPorContrato.get(c) || 0) + (l.valor_comissao || 0))
    }

    // zera todas as vendas primeiro
    await supabaseAdmin.from('vendas').update({ comissao_recebida_rs: 0, comissao_recebida_percent: 0 }).gt('valor_credito', 0)

    // aplica o recebido em cada venda que tem contrato correspondente
    for (const [contrato, recebido] of recebidoTotalPorContrato) {
      const venda = vendaPorContrato.get(contrato)
      if (!venda) continue
      const credito = venda.valor_credito || 0
      const percentRecebido = credito > 0 ? (recebido / credito) * 100 : 0
      await supabaseAdmin.from('vendas').update({
        comissao_recebida_rs: recebido,
        comissao_recebida_percent: percentRecebido,
      }).eq('id', venda.id)
      // vincula as linhas desse contrato à venda
      await supabaseAdmin.from('mapa_linhas').update({ venda_id: venda.id }).eq('contrato', contrato)
    }

    // não encontrados = SÓ os contratos DESTE mapa (não a soma de todos os mapas)
    const naoEncontrados: string[] = []
    for (const contrato of contratosUnicos) {
      if (!vendaPorContrato.get(contrato)) naoEncontrados.push(contrato)
    }

    return NextResponse.json({
      success: true,
      mapa_id: mapa.id,
      total_linhas: linhas.length,
      total_contratos: contratosUnicos.size,
      total_comissao: totalComissao,
      contratos_nao_encontrados: naoEncontrados,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
