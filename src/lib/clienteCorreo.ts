"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente SOLO para pedir correos (crear cuenta, entrar desde un dispositivo nuevo).
// Usa el flujo "implícito": el enlace del correo trae la sesión en la propia
// dirección, así que funciona aunque se abra en otro navegador (por ejemplo,
// el navegador interno de Gmail en el celular). No guarda sesión por sí mismo:
// la página /auth/confirmar la pasa al cliente normal de la app.
let cliente: SupabaseClient | null | undefined;

export function clienteCorreo(): SupabaseClient | null {
  if (cliente !== undefined) return cliente;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  cliente =
    url && key
      ? createClient(url, key, {
          auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        })
      : null;
  return cliente;
}

/** Dirección a la que vuelve el enlace del correo. */
export function enlaceDeVuelta(destino: string): string {
  return `${window.location.origin}/auth/confirmar?next=${encodeURIComponent(destino)}`;
}
