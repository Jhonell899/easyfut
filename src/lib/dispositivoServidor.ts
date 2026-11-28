import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";

// Token único del dispositivo (migración 018). Lo crea la base de datos al
// confirmar con el correo y vive en una cookie que la página no puede leer
// (httpOnly). En la base solo se guarda su huella, nunca el token.
export const COOKIE_DISPOSITIVO = "ef_disp";
const TREINTA_DIAS = 60 * 60 * 24 * 30;

/** IP del visitante según las cabeceras que pone Vercel. */
export function ipDe(cabeceras: Headers): string | null {
  const reenviada = cabeceras.get("x-forwarded-for")?.split(",")[0]?.trim();
  return reenviada || cabeceras.get("x-real-ip") || null;
}

export function agenteDe(cabeceras: Headers): string | null {
  return cabeceras.get("user-agent");
}

/**
 * ¿Falta la función en la base de datos (migración 018 sin aplicar)? Solo en ese caso
 * no se bloquea a nadie. Cualquier otro error (permisos, red…) se trata como "no confiable".
 */
export function faltaMigracion(error?: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "PGRST202" || /could not find the function/i.test(error.message ?? "");
}

/**
 * Crea un token nuevo para este dispositivo. Requiere haber entrado con el correo hace
 * poco, o el secreto de una solicitud de ingreso ya aprobada (migración 025).
 */
export async function crearTokenDispositivo(
  supabase: SupabaseClient,
  cabeceras: Headers,
  secreto?: string | null
): Promise<{ token: string | null; error: string | null }> {
  const datos = { p_ip: ipDe(cabeceras), p_agente: agenteDe(cabeceras) };
  const { data, error } = secreto
    ? await supabase.rpc("confiar_dispositivo_aprobado", { ...datos, p_secreto: secreto })
    : await supabase.rpc("confiar_dispositivo", datos);
  if (error) return { token: null, error: faltaMigracion(error) ? "migracion_pendiente" : error.message };
  return { token: typeof data === "string" ? data : null, error: null };
}

/** true = de confianza, false = no, null = la migración 018 aún no existe. */
export async function dispositivoEsConfiable(
  supabase: SupabaseClient,
  token: string | null | undefined,
  cabeceras: Headers
): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("dispositivo_confiable", {
    p_token: token ?? null,
    p_ip: ipDe(cabeceras),
    p_agente: agenteDe(cabeceras),
  });
  if (error) return faltaMigracion(error) ? null : false;
  return data === true;
}

export function ponerCookieDispositivo(respuesta: NextResponse, token: string) {
  respuesta.cookies.set(COOKIE_DISPOSITIVO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TREINTA_DIAS,
  });
}
