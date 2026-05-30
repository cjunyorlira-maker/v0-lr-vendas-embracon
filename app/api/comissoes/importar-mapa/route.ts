import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

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
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: buffer })
      const parsed = await parser.getText()
      await parser.destroy()
      texto = parsed.text || ''
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
    const regex = /(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d+)\s+(\S+)\s+(\d+)\s+([\d-]+)\s+(\w)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([\d,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/g

    let m
    while ((m = regex.exec(texto)) !== null) {
      linhas.push({
        bem: m[5],
        contrato: m[6],
        consorciado: m[7],
        parcela_de: parseInt(m[9]),
        parcela_ate: parseInt(m[10]),
        percentual_comis: parseNum(m[14]),
        calc_comis: parseNum(m[15]),
        valor_comissao: parseNum(m[16]),
        valor_estorno: parseNum(m[17]),
      })
    }

    if (linhas.length === 0) {
      return NextResponse.json({ error: "Não consegui ler linhas do mapa. Confira o PDF." }, { status: 400 })
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
    await supabaseAdmin.from('mapa_linhas').insert(linhasInsert)

    // Atualiza comissao recebida nas vendas encontradas
    const naoEncontrados: string[] = []
    for (const [contrato, recebidoNesseMapa] of recebidoPorContrato) {
      const venda = vendaPorContrato.get(contrato)
      if (!venda) { naoEncontrados.push(contrato); continue }
      // soma o que já tinha + o desse mapa
      const { data: vendaAtual } = await supabaseAdmin.from('vendas').select('comissao_recebida_rs, valor_credito').eq('id', venda.id).single()
      const jaTinha = vendaAtual?.comissao_recebida_rs || 0
      const novoTotal = jaTinha + recebidoNesseMapa
      const credito = vendaAtual?.valor_credito || 0
      const percentRecebido = credito > 0 ? (novoTotal / credito) * 100 : 0
      await supabaseAdmin.from('vendas').update({
        comissao_recebida_rs: novoTotal,
        comissao_recebida_percent: percentRecebido,
      }).eq('id', venda.id)
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
