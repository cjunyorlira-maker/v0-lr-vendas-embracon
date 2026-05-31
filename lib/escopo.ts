import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Retorna informações de escopo do usuário logado
export async function getEscopo(me: { id: string; role: string; empresa_id: string | null; equipe_id?: string | null }) {
  // descobre qual é a empresa matriz (onde está o master)
  let empresaMatrizId: string | null = null
  const { data: masterUser } = await supabaseAdmin
    .from('usuarios')
    .select('empresa_id')
    .eq('role', 'master')
    .limit(1)
    .single()
  if (masterUser) empresaMatrizId = masterUser.empresa_id

  // escopo global = master OU adm da matriz
  const escopoGlobal = me.role === 'master' || (me.role === 'adm' && me.empresa_id === empresaMatrizId)

  return { escopoGlobal, empresaMatrizId }
}
