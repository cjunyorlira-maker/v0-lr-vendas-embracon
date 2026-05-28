import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { parseProposta } from "@/lib/parse-proposta"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Detecta o plano cruzando bem + valor do crédito + adesão
function detectarPlano(
  planos: any[],
  bem: string | null,
  valorCredito: number | null,
  adesao: number | null
) {
  if (!bem || !valorCredito) return null

  // Filtra planos do mesmo bem, ativos
  let candidatos = planos.filter(
    (p) => p.ativo && p.bem === bem
  )

  // Filtra por faixa de crédito
  candidatos = candidatos.filter((p) => {
    const min = p.faixa_credito_min ?? 0
    const max = p.faixa_credito_max ?? Infinity
    return valorCredito >= min && valorCredito <= max
  })

  // Se sabemos a adesão, filtra por ela
  if (adesao !== null) {
    const porAdesao = candidatos.filter((p) => Number(p.adesao_percent) === adesao)
    if (porAdesao.length > 0) candidatos = porAdesao
  }

  // Retorna o primeiro candidato (mais provável) ou null
  return candidatos.length > 0 ? candidatos[0] : null
}

// Calcula a adesão (1% ou 2%) cruzando 1ª parcela com crédito
function calcularAdesao(valorCredito: number | null, primeiraParcela: number | null): number | null {
  if (!valorCredito || !primeiraParcela) return null
  // A taxa de antecipação (1% ou 2%) está embutida na 1ª parcela
  // 1% de 100.000 = 1.000 ; 2% de 100.000 = 2.000
  const taxa1 = valorCredito * 0.01
  const taxa2 = valorCredito * 0.02
  // Verifica qual adesão faz a 1ª parcela bater melhor
  // (1ª parcela = demais_parcela + taxa_antecipada)
  // Como não temos demais_parcela, usamos heurística: se 1ª parcela > 1.5x taxa2, provavelmente 2%
  const difPara1 = Math.abs(primeiraParcela - taxa1)
  const difPara2 = Math.abs(primeiraParcela - taxa2)
  // Heurística simples: retorna a adesão cuja taxa está mais próxima de uma fração da parcela
  // Na prática o vendedor confirma, isso é só sugestão
  if (primeiraParcela >= taxa2 * 0.8 && primeiraParcela <= taxa2 * 3) return 2
  if (primeiraParcela >= taxa1 * 0.8 && primeiraParcela <= taxa1 * 3) return 1
  return null
}

export async function POST(req: NextRequest) {
  try {
    // Autenticação
    const cookieStore = await cookies()
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )
    const { data: { user: authUser } } = await supabaseUser.auth.getUser()
    if (!authUser) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

    // Recebe o arquivo
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 })

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: "Arquivo deve ser PDF" }, { status: 400 })
    }

    // Converte pra buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Extrai texto do PDF (API da v2: classe PDFParse)
    let textoPdf = ''
    try {
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: buffer })
      const data = await parser.getText()
      await parser.destroy()
      textoPdf = data.text || ''
    } catch (e) {
      return NextResponse.json({
        error: "Não foi possível ler o PDF. Pode ser um PDF escaneado (imagem). Preencha os dados manualmente.",
        parse_falhou: true,
        dados: null,
      }, { status: 200 })
    }

    if (!textoPdf || textoPdf.trim().length < 20) {
      return NextResponse.json({
        error: "PDF sem texto legível (provavelmente escaneado). Preencha manualmente.",
        parse_falhou: true,
        dados: null,
      }, { status: 200 })
    }

    // Roda o parser
    const dados = parseProposta(textoPdf)

    // Calcula adesão
    const adesao = calcularAdesao(dados.valor_credito, dados.valor_primeira_parcela)

    // Busca planos pra detectar
    const { data: planos } = await supabaseAdmin
      .from('planos')
      .select('id, sigla, nome_completo, bem, adesao_percent, faixa_credito_min, faixa_credito_max, ativo')

    const planoDetectado = detectarPlano(planos || [], dados.bem_detectado, dados.valor_credito, adesao)

    return NextResponse.json({
      success: true,
      parse_falhou: false,
      dados: {
        ...dados,
        adesao_calculada: adesao,
      },
      plano_detectado: planoDetectado ? {
        id: planoDetectado.id,
        sigla: planoDetectado.sigla,
        nome_completo: planoDetectado.nome_completo,
        bem: planoDetectado.bem,
        adesao_percent: planoDetectado.adesao_percent,
      } : null,
      texto_bruto: textoPdf.slice(0, 500), // primeiros 500 chars pra debug
    })

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
