import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { getEscopo } from '@/lib/escopo'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function autenticar() {
  const cookieStore = await cookies()
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user: authUser } } = await supabaseUser.auth.getUser()
  if (!authUser) return null
  const { data: usuario } = await supabaseAdmin
    .from('usuarios').select('id, role, empresa_id').eq('auth_user_id', authUser.id).single()
  return usuario || null
}

// POST: master/adm sobem o PDF do extrato da cota
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: boletoId } = await params
    const usuario = await autenticar()
    if (!usuario) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    if (!['master', 'adm'].includes(usuario.role)) {
      return NextResponse.json({ error: "Apenas master/adm podem anexar o extrato" }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const base64: string = body.base64 || ''
    const nome: string = body.nome || 'extrato.pdf'
    if (!base64) return NextResponse.json({ error: "PDF do extrato não enviado" }, { status: 400 })

    const { data: boleto } = await supabaseAdmin
      .from('boletos').select('id, empresa_id, clientes(nome)').eq('id', boletoId).single()
    if (!boleto) return NextResponse.json({ error: "Boleto não encontrado" }, { status: 404 })

    const { escopoGlobal } = await getEscopo(usuario)
    if (!escopoGlobal && boleto.empresa_id !== usuario.empresa_id) {
      return NextResponse.json({ error: "Sem permissão para esse boleto" }, { status: 403 })
    }

    const matches = base64.match(/^data:(.+);base64,(.+)$/)
    if (!matches) return NextResponse.json({ error: "PDF inválido" }, { status: 400 })
    const buffer = Uint8Array.from(atob(matches[2]), c => c.charCodeAt(0))
    const path = `${boletoId}/${Date.now()}-${nome.replace(/[^a-zA-Z0-9.\-]/g, '_')}`
    const { error: upErr } = await supabaseAdmin.storage.from('extratos-cota').upload(path, buffer, { contentType: 'application/pdf' })
    if (upErr) return NextResponse.json({ error: "Erro ao subir extrato: " + upErr.message }, { status: 500 })

    const { error: updErr } = await supabaseAdmin.from('boletos').update({
      extrato_url: path, extrato_nome: nome, extrato_baixado: false,
      extrato_baixado_por: null, extrato_baixado_em: null,
      atualizado_em: new Date().toISOString(),
    }).eq('id', boletoId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    try {
      const nomeCliente = (boleto as any).clientes?.nome || 'Cliente'
      await supabaseAdmin.from('notificacoes').insert({
        empresa_id: boleto.empresa_id, destinatario_role: 'representante',
        titulo: '📄 Extrato da cota disponível', mensagem: `Extrato da cota disponível — ${nomeCliente}`,
        tipo: 'generico', link_url: '/boletos', boleto_id: boletoId,
      })
    } catch {}

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// GET: gera link assinado do extrato; se o representante baixa, marca como baixado
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: boletoId } = await params
    const usuario = await autenticar()
    if (!usuario) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

    const { data: boleto } = await supabaseAdmin
      .from('boletos').select('id, empresa_id, extrato_url, extrato_baixado').eq('id', boletoId).single()
    if (!boleto || !boleto.extrato_url) return NextResponse.json({ error: "Extrato não encontrado" }, { status: 404 })

    const { escopoGlobal } = await getEscopo(usuario)
    if (!escopoGlobal && boleto.empresa_id !== usuario.empresa_id) {
      return NextResponse.json({ error: "Sem permissão para esse boleto" }, { status: 403 })
    }

    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from('extratos-cota').createSignedUrl(boleto.extrato_url, 3600)
    if (signErr || !signed) return NextResponse.json({ error: "Erro ao gerar link" }, { status: 500 })

    // representante baixando pela primeira vez → marca rastreio
    if (usuario.role === 'representante' && !boleto.extrato_baixado) {
      await supabaseAdmin.from('boletos').update({
        extrato_baixado: true, extrato_baixado_por: usuario.id,
        extrato_baixado_em: new Date().toISOString(),
      }).eq('id', boletoId)
    }

    return NextResponse.json({ url: signed.signedUrl })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
