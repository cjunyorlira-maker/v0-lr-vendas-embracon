import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function getMe() {
  const cookieStore = await cookies()
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user: authUser } } = await supabaseUser.auth.getUser()
  if (!authUser) return null
  const { data: me } = await supabaseAdmin.from('usuarios').select('id, role, empresa_id').eq('auth_user_id', authUser.id).single()
  return me
}

// GET: lista os extratos existentes (todos podem ver)
export async function GET() {
  try {
    const me = await getMe()
    if (!me) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    const { data: extratos } = await supabaseAdmin
      .from('extratos_grupo').select('grupo, bem, arquivo_nome, atualizado_em').order('grupo')
    return NextResponse.json({ extratos: extratos || [] })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST: sobe o extrato; lê o grupo do PDF automaticamente. Só adm/master/representante.
export async function POST(req: NextRequest) {
  try {
    const me = await getMe()
    if (!me) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    if (!['adm', 'master', 'representante'].includes(me.role)) {
      return NextResponse.json({ error: "Sem permissão pra subir extrato" }, { status: 403 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: "Nenhum arquivo" }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())

    // lê o grupo do PDF (seção "Grupo Cota Prazo" → primeiro número de 6 dígitos)
    const pdfParse = (await import('pdf-parse')).default
    function renderPage(pageData: any) {
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
    const parsed = await pdfParse(buffer, { pagerender: renderPage })
    const txt = (parsed.text || '').replace(/\u00a0/g, ' ')
    const m = txt.match(/Grupo\s+Cota\s+Prazo\s*\n\s*(\d{6})/)
    const grupo = m ? m[1].replace(/^0+/, '') : null
    if (!grupo) return NextResponse.json({ error: "Não consegui identificar o grupo no PDF. Confira se é o Demonstrativo do Grupo." }, { status: 400 })

    // pega o bem do grupo (se mapeado)
    const { data: gi } = await supabaseAdmin.from('assembleias_grupos_info').select('bem').eq('grupo', grupo).maybeSingle()
    const bem = gi?.bem || null

    const nomeArquivo = (file.name || `extrato-${grupo}.pdf`).replace(/[^a-zA-Z0-9.\-]/g, '_')
    const path = `${grupo}/${Date.now()}-${nomeArquivo}`

    // remove o anterior do storage
    const { data: anterior } = await supabaseAdmin.from('extratos_grupo').select('arquivo_path').eq('grupo', grupo).maybeSingle()
    if (anterior?.arquivo_path) {
      await supabaseAdmin.storage.from('extratos-grupo').remove([anterior.arquivo_path])
    }

    const { error: upErr } = await supabaseAdmin.storage
      .from('extratos-grupo').upload(path, buffer, { contentType: 'application/pdf', upsert: false })
    if (upErr) return NextResponse.json({ error: 'Erro ao subir: ' + upErr.message }, { status: 500 })

    const { error: dbErr } = await supabaseAdmin.from('extratos_grupo').upsert({
      grupo, bem, arquivo_path: path, arquivo_nome: file.name || nomeArquivo,
      subido_por: me.id, atualizado_em: new Date().toISOString(),
    }, { onConflict: 'grupo' })
    if (dbErr) return NextResponse.json({ error: 'Erro ao salvar: ' + dbErr.message }, { status: 500 })

    return NextResponse.json({ success: true, grupo })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
