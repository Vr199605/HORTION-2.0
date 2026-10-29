import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && key)

// Se não estiver configurado, o app ainda abre (modo demo) e mostra um aviso no painel.
export const supabase = createClient(
  url || 'http://localhost:54321',
  key || 'public-anon-key-not-configured',
  { auth: { persistSession: true, autoRefreshToken: true } },
)

export const BRAND = (import.meta.env.VITE_BRAND_NAME as string) || 'HORTION'
export const SALES_WHATSAPP = (import.meta.env.VITE_SALES_WHATSAPP as string) || ''
