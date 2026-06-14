import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()
    const supabaseUser = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )
    const { data: { user: authUser } } = await supabaseUser.auth.getUser()
    if (!authUser) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: "Nenhum arquivo" }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const pdfParse = (await import('pdf-parse')).default
    function renderPage(pageData: any) {
      if (pageData.pageNumber > 1) return ''
      return pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false }).then((tc: any) => {
        let lastY: any, txt = ''
        for (const item of tc.items) {
          if (lastY === item.transform[5] || lastY === undefined) txt += item.str + ' '
          else txt += '\n' + item.str + ' '
          lastY = item.transform[5]
        }
        return txt
      })
    }
    const parsed = await pdfParse(buffer, { pagerender: renderPage, max: 1 })
    const txt = (parsed.text || '').replace(/\u00a0/g, ' ')

    // extrai grupo
    const grupoM = txt.match(/Grupo:[\s\S]*?(\d{6})/)
    const grupo = grupoM ? grupoM[1].replace(/^0+/, '') : null
    if (!grupo) return NextResponse.json({ error: "Não consegui identificar o grupo no PDF" }, { status: 400 })

    // próxima assembleia número
    const proxNumM = txt.match(/Número:[\s\S]*?(\d+)/)
    const proximaNum = proxNumM ? parseInt(proxNumM[1]) : null
    // assembleia deste resultado
    const assembM = txt.match(/Assembleia:\s*(\d+)/)
    const numeroAssembleia = assembM ? parseInt(assembM[1]) : null
    // data do resultado
    const dataM = txt.match(/(\d{2})\/(\d{2})\/(\d{4})\s+00:00:00/)
    let mesRef = '', mesLabel = ''
    if (dataM) {
      const mes = parseInt(dataM[2]), ano = dataM[3]
      mesRef = `${ano}-${String(mes).padStart(2,'0')}`
      mesLabel = `${MESES[mes-1].charAt(0).toUpperCase() + MESES[mes-1].slice(1)}/${ano}`
    }
    // prazos
    const prazoM = txt.match(/Prazo:[\s\S]*?(\d+)/)
    const prazoInicial = prazoM ? parseInt(prazoM[1]) : null
    const realizadasM = txt.match(/Assembleias realizadas:[\s\S]*?(\d+)/)
    const realizadas = realizadasM ? parseInt(realizadasM[1]) : null
    const arealizarM = txt.match(/Assembleias à realizar:[\s\S]*?(\d+)/)
    const prazoRestante = arealizarM ? parseInt(arealizarM[1]) : null

    // contagem por modalidade (lista de contemplações confirmadas)
    const iniCont = txt.indexOf('Contemplações Confirmadas')
    const fimCont = txt.indexOf('Contemplações Confirmadas (Canceladas)')
    const secCont = fimCont > iniCont ? txt.slice(iniCont, fimCont) : txt.slice(iniCont)
    const sorteioQt = (secCont.match(/\d{4}-\d{2} Sorteio/g) || []).length
    const fixo50Qt = (secCont.match(/\d{4}-\d{2} Lance Fixo/g) || []).length
    const fixo25Qt = (secCont.match(/\d{4}-\d{2} 2o Lance Fixo/g) || []).length
    const livreQt = (secCont.match(/\d{4}-\d{2} Lance Livre/g) || []).length
    const totalContemplados = sorteioQt + fixo50Qt + fixo25Qt + livreQt

    // percentuais do lance livre (maior/menor)
    const pcts = (secCont.match(/\d{4}-\d{2} Lance Livre[^\n]*?(\d+,\d+)\s/g) || [])
      .map(l => { const m = l.match(/(\d+,\d+)\s*$/); return m ? parseFloat(m[1].replace(',', '.')) / 100 : null })
      .filter((x): x is number => x != null)
    const livreMaior = pcts.length ? Math.max(...pcts) : null
    const livreMenor = pcts.length ? Math.min(...pcts) : null

    // cotas NOSSAS contempladas (cota != 0000-00)
    const cotasContempladas = (secCont.match(/(\d{4}-\d{2})\s+(Sorteio|Lance Fixo|2o Lance Fixo|Lance Livre)/g) || [])
      .map(l => { const m = l.match(/(\d{4}-\d{2})\s+(Sorteio|Lance Fixo|2o Lance Fixo|Lance Livre)/); return m ? { cota: m[1], modalidade: m[2] } : null })
      .filter((x): x is { cota: string; modalidade: string } => x != null && x.cota !== '0000-00')

    // salva no histórico (upsert por grupo+mês)
    const bem = await supabaseAdmin.from('assembleias_grupos_info').select('bem').eq('grupo', grupo).single().then(r => r.data?.bem || null)
    const { error: errHist } = await supabaseAdmin.from('assembleias_historico').upsert({
      grupo, bem, mes_referencia: mesRef, mes_label: mesLabel, numero_assembleia: numeroAssembleia,
      sorteio_qt: sorteioQt, lance_livre_qt: livreQt, lance_livre_maior: livreMaior, lance_livre_menor: livreMenor,
      lance_fixo_50_qt: fixo50Qt, lance_fixo_25_qt: fixo25Qt, total_contemplados: totalContemplados,
      prazo_inicial: prazoInicial, prazo_restante: prazoRestante,
    }, { onConflict: 'grupo,mes_referencia' })
    if (errHist) return NextResponse.json({ error: 'Erro ao salvar histórico: ' + errHist.message }, { status: 500 })

    // atualiza info do grupo (próxima assembleia)
    if (prazoInicial != null && prazoRestante != null) {
      await supabaseAdmin.from('assembleias_grupos_info').upsert({
        grupo, bem, prazo_inicial: prazoInicial, prazo_restante: prazoRestante,
      }, { onConflict: 'grupo' })
    }

    return NextResponse.json({
      success: true, grupo, mes_label: mesLabel, numero_assembleia: numeroAssembleia,
      resumo: { sorteio: sorteioQt, fixo50: fixo50Qt, fixo25: fixo25Qt, livre: livreQt, total: totalContemplados },
      cotas_nossas: cotasContempladas,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
