import { createClient } from '@supabase/supabase-js'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const s = createClient(url, key)
const { data, error } = await s.from('empresas').select('id, nome, logo_url, logo_branca_url, ativo').order('nome')
if (error) { console.log('ERR', error.message); process.exit(1) }
for (const e of data) {
  console.log(JSON.stringify({ id: e.id, nome: e.nome, logo_url: e.logo_url, logo_branca_url: e.logo_branca_url, ativo: e.ativo }))
}
