"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

// Identificador al azar de este celular o computadora. Se guarda en el
// navegador y en una cookie (para que el servidor también lo vea).
const CLAVE = "easyfut:dispositivo";
export const COOKIE_DISPOSITIVO = "ef_disp";

function ponerCookie(id: string) {
  const segura = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_DISPOSITIVO}=${id}; Path=/; Max-Age=${60 * 60 * 24 * 400}; SameSite=Lax${segura}`;
}

export function idDispositivo(): string {
  let id: string | null = null;
  try {
    id = localStorage.getItem(CLAVE);
  } catch {}
  if (!id) {
    id = document.cookie.match(/(?:^|; )ef_disp=([^;]+)/)?.[1] ?? null;
  }
  if (!id) id = `${crypto.randomUUID()}-${crypto.randomUUID().slice(0, 8)}`;
  try {
    localStorage.setItem(CLAVE, id);
  } catch {}
  ponerCookie(id);
  return id;
}

/**
 * ¿Este dispositivo ya es de confianza para la cuenta con sesión?
 * null = la función no existe todavía (migración 018 pendiente): no se exige el paso extra.
 */
export async function esConfiable(supabase: SupabaseClient): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("dispositivo_confiable", { p_dispositivo: idDispositivo() });
  if (error) return /dispositivo_confiable|schema cache|does not exist/i.test(error.message) ? null : false;
  return data === true;
}

/** Marca este dispositivo como de confianza. Solo funciona justo después de entrar con un código. */
export async function confiarDispositivo(supabase: SupabaseClient) {
  await supabase.rpc("confiar_dispositivo", { p_dispositivo: idDispositivo() });
}
