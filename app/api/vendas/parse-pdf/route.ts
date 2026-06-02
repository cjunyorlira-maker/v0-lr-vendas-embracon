import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { parseProposta } from "@/lib/parse-proposta"

// pdf-parse precisa do runtime Node.js (não funciona no Edge)
export const runtime = 'nodejs'
export const maxDuration = 30

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
function calcularAdesao(valorCredito: number | null, primeiraParcela: number | null, demaisParcela?: number | null): number | null {
  if (!valorCredito || !primeiraParcela) return null
  // Fórmula EXATA: a adesão é a diferença entre a 1ª parcela e as demais, sobre o crédito.
  // (1ª parcela = parcela normal + taxa de adesão; taxa = adesao% do crédito)
  if (demaisParcela && demaisParcela > 0) {
    const taxaAdesao = primeiraParcela - demaisParcela
    const percent = (taxaAdesao / valorCredito) * 100
    // arredonda pro inteiro mais próximo (1 ou 2)
    if (percent >= 0.5 && percent < 1.5) return 1
    if (percent >= 1.5 && percent <= 2.5) return 2
    // fora da faixa esperada — retorna o arredondado
    return Math.round(percent) || null
  }
  // fallback (sem demais parcela): compara com as taxas, testando 1% primeiro (mais comum)
  const taxa1 = valorCredito * 0.01
  const taxa2 = valorCredito * 0.02
  const dif1 = Math.abs(primeiraParcela - taxa1)
  const dif2 = Math.abs(primeiraParcela - taxa2)
  return dif1 <= dif2 ? 1 : 2
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

    // Extrai texto do PDF (v1) com render que preserva o layout (junta itens da mesma linha)
    let textoPdf = ''
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
      const data = await pdfParse(buffer, { pagerender: renderPage })
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
    const adesao = calcularAdesao(dados.valor_credito, dados.valor_primeira_parcela, dados.valor_demais_parcelas)

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
      texto_bruto: textoPdf, // texto completo pra debug
    })

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
