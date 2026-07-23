import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const s = createClient(url, key)

const EMPRESA_ID = 'b1ada01d-0fff-4012-914f-9b2e0937fff8'
const NOVO_NOME = 'Grupo Portal (MG)'
const BUCKET = 'logos-empresas'
const ts = Date.now()

async function up(localPath, dest) {
  const buf = readFileSync(localPath)
  const { error } = await s.storage.from(BUCKET).upload(dest, buf, { contentType: 'image/png', upsert: true })
  if (error) throw new Error('upload ' + dest + ': ' + error.message)
  const { data } = s.storage.from(BUCKET).getPublicUrl(dest)
  return data.publicUrl
}

const corUrl = await up('scripts/portal-cor-out.png', `portal-cor-${ts}.png`)
const brancaUrl = await up('scripts/portal-branca-out.png', `portal-branca-${ts}.png`)

const { error } = await s.from('empresas')
  .update({ nome: NOVO_NOME, logo_url: corUrl, logo_branca_url: brancaUrl })
  .eq('id', EMPRESA_ID)
if (error) throw new Error('update: ' + error.message)

console.log(JSON.stringify({ nome: NOVO_NOME, logo_url: corUrl, logo_branca_url: brancaUrl }, null, 2))
