import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente de solo lectura pública (usa la clave anon/publishable).
// Las reglas de seguridad (RLS) de la base de datos limitan lo que puede ver.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Si faltan las credenciales en .env.local, el cliente queda en null
// y las páginas muestran un aviso en lugar de romperse.
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;
