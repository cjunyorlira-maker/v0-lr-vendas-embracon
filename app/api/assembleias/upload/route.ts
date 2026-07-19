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

    // extrai grupo e prazo (layout: labels juntos, depois valores juntos, após "Encerramento previsto:")
    const bloco1 = txt.match(/Encerramento previsto:\s*\n(\d{6})\s*\n(\d+)/)
    const grupo = bloco1 ? bloco1[1].replace(/^0+/, '') : null
    if (!grupo) return NextResponse.json({ error: "Não consegui identificar o grupo no PDF" }, { status: 400 })
    const prazoInicialPdf = bloco1 ? parseInt(bloco1[2]) : null

    // número da próxima assembleia (explícito no PDF, após "Cidade:")
    const proxNumM = txt.match(/Informações sobre a próxima assembleia[\s\S]*?Cidade:\s*\n(\d+)/)
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
    // prazos: após "Assembleias à realizar:" vêm dois números (à realizar e realizadas, na ordem)
    const prazoInicial = prazoInicialPdf
    const blocoPrazo = txt.match(/Assembleias à realizar:\s*\n(\d+)\s*\n(\d+)/)
    let prazoRestante: number | null = null
    if (blocoPrazo) {
      const a = parseInt(blocoPrazo[1]), b = parseInt(blocoPrazo[2])
      // à realizar é o maior (faltam mais assembleias); realizadas é o menor
      prazoRestante = Math.max(a, b)
    } else if (proximaNum != null && prazoInicial != null) {
      // fallback: se não achou, calcula pelo número da próxima (realizadas = proximaNum - 1)
      prazoRestante = prazoInicial - (proximaNum - 1)
    }

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

    // ── guarda o PDF do RESULTADO no storage (bucket resultados-assembleia) ──
    // garante o bucket (idempotente: ignora erro se já existir)
    await supabaseAdmin.storage.createBucket('resultados-assembleia', { public: false }).catch(() => {})
    const nomeArquivo = (file.name || `resultado-${grupo}.pdf`).replace(/[^a-zA-Z0-9.\-]/g, '_')
    const arquivoPath = `${grupo}/${(mesRef || 'sem-mes')}-${nomeArquivo}`
    // remove versão anterior deste grupo+mês (se houver) e sobe a nova
    const { data: antRes } = await supabaseAdmin.from('assembleias_historico')
      .select('arquivo_path').eq('grupo', grupo).eq('mes_referencia', mesRef).maybeSingle()
    if (antRes?.arquivo_path && antRes.arquivo_path !== arquivoPath) {
      await supabaseAdmin.storage.from('resultados-assembleia').remove([antRes.arquivo_path])
    }
    const { error: upResErr } = await supabaseAdmin.storage
      .from('resultados-assembleia').upload(arquivoPath, buffer, { contentType: 'application/pdf', upsert: true })
    if (upResErr) return NextResponse.json({ error: 'Erro ao guardar o resultado: ' + upResErr.message }, { status: 500 })

    // salva no histórico (upsert por grupo+mês)
    const bem = await supabaseAdmin.from('assembleias_grupos_info').select('bem').eq('grupo', grupo).single().then(r => r.data?.bem || null)
    const { error: errHist } = await supabaseAdmin.from('assembleias_historico').upsert({
      grupo, bem, mes_referencia: mesRef, mes_label: mesLabel, numero_assembleia: numeroAssembleia,
      sorteio_qt: sorteioQt, lance_livre_qt: livreQt, lance_livre_maior: livreMaior, lance_livre_menor: livreMenor,
      lance_fixo_50_qt: fixo50Qt, lance_fixo_25_qt: fixo25Qt, total_contemplados: totalContemplados,
      prazo_inicial: prazoInicial, prazo_restante: prazoRestante,
      arquivo_path: arquivoPath, arquivo_nome: file.name || nomeArquivo,
    }, { onConflict: 'grupo,mes_referencia' })
    if (errHist) return NextResponse.json({ error: 'Erro ao salvar histórico: ' + errHist.message }, { status: 500 })

    // atualiza info do grupo (próxima assembleia)
    if (prazoInicial != null && prazoRestante != null) {
      await supabaseAdmin.from('assembleias_grupos_info').upsert({
        grupo, bem, prazo_inicial: prazoInicial, prazo_restante: prazoRestante,
      }, { onConflict: 'grupo' })
    }

    // ── Cruzamento com NOSSAS vendas: marca contemplado SÓ por grupo+cota do resultado oficial ──
    const contempladosMarcados: any[] = []
    for (const item of cotasContempladas) {
      const cotaBase = item.cota.slice(0, 4) // "3625-00" → "3625"
      const modalidade = item.modalidade
      // vendas nossas deste grupo com esta cota (formatos variam: 3625, 3625-0, 3625-00)
      const { data: vendasCota } = await supabaseAdmin.from('vendas')
        .select('id, cliente_id, empresa_id, clientes(nome)')
        .eq('grupo', grupo)
        .like('cota', cotaBase + '%')
      for (const vd of (vendasCota || []) as any[]) {
        // marca o lance do mês desta assembleia (se existir) e encerra a config
        const { data: cfgs } = await supabaseAdmin.from('lances_config')
          .select('id').eq('venda_id', vd.id).eq('ativo', true)
        for (const cfg of (cfgs || []) as any[]) {
          await supabaseAdmin.from('lances_mensais')
            .update({ contemplado: true })
            .eq('lance_config_id', cfg.id)
            .eq('mes_referencia', mesRef)
          await supabaseAdmin.from('lances_config')
            .update({ ativo: false, status_final: 'contemplado', atualizado_em: new Date().toISOString() })
            .eq('id', cfg.id)
        }
        const nome = vd.clientes?.nome || 'Cliente'
        contempladosMarcados.push({ cliente: nome, cota: cotaBase, modalidade })
        // notificação no sininho (mesmo padrão do sistema)
        try {
          await supabaseAdmin.from('notificacoes').insert([
            { empresa_id: vd.empresa_id, destinatario_role: 'adm', titulo: '🏆 Contemplado!', mensagem: `${nome} — grupo ${grupo} cota ${cotaBase} (${modalidade})`, tipo: 'generico', venda_id: vd.id, link_url: '/lances' },
            { empresa_id: vd.empresa_id, destinatario_role: 'representante', titulo: '🏆 Contemplado!', mensagem: `${nome} — grupo ${grupo} cota ${cotaBase} (${modalidade})`, tipo: 'generico', venda_id: vd.id, link_url: '/lances' },
          ])
        } catch {}
      }
    }

    return NextResponse.json({
      success: true, grupo, mes_label: mesLabel, numero_assembleia: numeroAssembleia,
      resumo: { sorteio: sorteioQt, fixo50: fixo50Qt, fixo25: fixo25Qt, livre: livreQt, total: totalContemplados },
      cotas_nossas: cotasContempladas,
      contemplados_marcados: contempladosMarcados,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
