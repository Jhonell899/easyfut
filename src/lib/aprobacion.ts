"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { clienteCorreo, enlaceDeVuelta } from "@/lib/clienteCorreo";
import { registrarEnvio } from "@/lib/dispositivo";

// Confirmar con un toque en el enlace del correo, desde cualquier dispositivo (migración 025).
// La pantalla que espera guarda un secreto de un solo uso; la base solo guarda su huella.

export type EstadoAprobacion = "pendiente" | "aprobada" | "usada" | "rechazada" | "vencida" | "no_existe";

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** Secreto nuevo y su huella SHA-256 (igual que huella_token() en la base). null si el navegador no puede. */
export async function crearSecreto(): Promise<{ secreto: string; huella: string } | null> {
  try {
    const secreto = hex(crypto.getRandomValues(new Uint8Array(32)));
    const huella = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secreto))));
    return { secreto, huella };
  } catch {
    return null; // sin crypto.subtle (página sin https): solo funciona abriendo el enlace en este navegador
  }
}

/** Dispositivo nuevo: crea la solicitud de ingreso (con la sesión de la contraseña). */
export async function pedirAprobacion(
  supabase: SupabaseClient
): Promise<{ solicitud: string; secreto: string } | { error: string }> {
  const { data, error } = await supabase.rpc("pedir_aprobacion_ingreso");
  if (error) return { error: /demasiados_intentos/.test(error.message) ? "demasiados_intentos" : "sin_solicitud" };
  const fila = (Array.isArray(data) ? data[0] : data) as { solicitud?: string; secreto?: string } | null;
  if (!fila?.solicitud || !fila?.secreto) return { error: "sin_solicitud" };
  return { solicitud: fila.solicitud, secreto: fila.secreto };
}

/** Cómo va la solicitud de este secreto; null si no se pudo saber (sin conexión o sin la 025). */
export async function estadoAprobacion(supabase: SupabaseClient, secreto: string): Promise<EstadoAprobacion | null> {
  const { data, error } = await supabase.rpc("estado_aprobacion", { p_secreto: secreto });
  if (error || typeof data !== "string") return null;
  return data as EstadoAprobacion;
}

// ---------------------------------------------------------------------------
// Marca en este navegador: "aquí hay una pantalla esperando el enlace de tal correo".
// Así la página del enlace sabe si se abrió en el mismo navegador que lo pidió.
// Nunca guarda la contraseña.

const CLAVE_ESPERA = "easyfut:espera";

export type Espera = {
  tipo: "registro" | "dispositivo";
  correo: string;
  solicitud?: string;
  secreto?: string;
  hasta: number;
};

export function guardarEspera(espera: Omit<Espera, "hasta">, minutos: number) {
  try {
    const valor: Espera = { ...espera, correo: espera.correo.trim().toLowerCase(), hasta: Date.now() + minutos * 60_000 };
    localStorage.setItem(CLAVE_ESPERA, JSON.stringify(valor));
  } catch {}
}

export function leerEspera(): Espera | null {
  try {
    const valor = JSON.parse(localStorage.getItem(CLAVE_ESPERA) ?? "null") as Espera | null;
    if (!valor || typeof valor.correo !== "string" || !(valor.hasta > Date.now())) return null;
    return valor;
  } catch {
    return null;
  }
}

export function borrarEspera() {
  try {
    localStorage.removeItem(CLAVE_ESPERA);
  } catch {}
}

/** "Chrome en Windows", "Safari en iPhone/iPad"… a partir del navegador guardado. */
export function describirNavegador(agente?: string | null): string {
  if (!agente) return "Navegador desconocido";
  const nav = /Edg\//.test(agente)
    ? "Edge"
    : /OPR\/|Opera/.test(agente)
      ? "Opera"
      : /SamsungBrowser/.test(agente)
        ? "Samsung Internet"
        : /Firefox\//.test(agente)
          ? "Firefox"
          : /Chrome\//.test(agente)
            ? "Chrome"
            : /Safari\//.test(agente)
              ? "Safari"
              : "Navegador";
  const sistema = /Android/.test(agente)
    ? "Android"
    : /iPhone|iPad|iPod/.test(agente)
      ? "iPhone/iPad"
      : /Windows/.test(agente)
        ? "Windows"
        : /Mac OS X/.test(agente)
          ? "Mac"
          : /Linux/.test(agente)
            ? "Linux"
            : "";
  return sistema ? `${nav} en ${sistema}` : nav;
}

// ---------------------------------------------------------------------------
// Entrar desde un dispositivo nuevo

/** Mensaje claro cuando Supabase no manda el correo. */
export function mensajeErrorCorreo(msg: string): string {
  if (/email rate limit|over_email_send_rate_limit/i.test(msg))
    return "Se alcanzó el límite de correos por hora. Espera un rato y toca “Reenviar correo”.";
  if (/security purposes|after \d+ seconds|rate limit|too many/i.test(msg))
    return "Ya te enviamos un correo hace poco. Espera un minuto y toca “Reenviar correo”.";
  return "No pudimos enviarte el correo. Toca “Reenviar correo” en un momento.";
}

/** Manda el enlace “Log In” que aprueba la solicitud. Devuelve un mensaje de error o null. */
export async function mandarEnlaceIngreso(
  supabase: SupabaseClient,
  correo: string,
  destino: string,
  solicitud: string | null
): Promise<string | null> {
  registrarEnvio(correo);
  const { error } = await (clienteCorreo() ?? supabase).auth.signInWithOtp({
    email: correo,
    options: { shouldCreateUser: false, emailRedirectTo: enlaceDeVuelta(destino, { solicitud }) },
  });
  return error ? mensajeErrorCorreo(error.message) : null;
}

export type IngresoNuevo = {
  secreto: string | null;
  solicitud: string | null;
  /** Error al mandar el correo (la pantalla de espera lo muestra) */
  error: string | null;
  /** Demasiados intentos en la última hora */
  bloqueado: boolean;
};

/**
 * Dispositivo nuevo, con la sesión de la contraseña todavía abierta: si este navegador
 * ya espera un enlace para este correo, lo reutiliza (no manda otro correo); si no,
 * crea la solicitud y manda el correo.
 */
export async function prepararIngresoNuevo(
  supabase: SupabaseClient,
  correo: string,
  destino: string
): Promise<IngresoNuevo> {
  const email = correo.trim();
  const previa = leerEspera();
  if (
    previa?.tipo === "dispositivo" &&
    previa.correo === email.toLowerCase() &&
    previa.solicitud &&
    previa.secreto &&
    (await estadoAprobacion(supabase, previa.secreto)) === "pendiente"
  ) {
    return { secreto: previa.secreto, solicitud: previa.solicitud, error: null, bloqueado: false };
  }

  const nueva = await pedirAprobacion(supabase);
  if ("error" in nueva && nueva.error === "demasiados_intentos")
    return { secreto: null, solicitud: null, error: null, bloqueado: true };
  // Sin la migración 025 sigue funcionando, pero solo abriendo el enlace en este navegador
  const sol = "error" in nueva ? null : nueva;
  guardarEspera({ tipo: "dispositivo", correo: email, solicitud: sol?.solicitud, secreto: sol?.secreto }, 30);
  const error = await mandarEnlaceIngreso(supabase, email, destino, sol?.solicitud ?? null);
  return { secreto: sol?.secreto ?? null, solicitud: sol?.solicitud ?? null, error, bloqueado: false };
}
