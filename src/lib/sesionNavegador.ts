"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Cliente para componentes del navegador. Lleva la sesión del usuario
// (cookies), así auth.uid() funciona en la base de datos.
let cliente: SupabaseClient | null | undefined;

export function supabaseNavegador(): SupabaseClient | null {
  if (cliente !== undefined) return cliente;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  cliente = url && key ? createBrowserClient(url, key) : null;
  return cliente;
}
