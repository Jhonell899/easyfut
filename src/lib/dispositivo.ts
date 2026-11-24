"use client";

// El token del dispositivo lo crea y guarda el servidor en una cookie que esta
// página no puede leer (ver /api/dispositivo y la migración 018).

/** true = de confianza, false = pide verificación, null = la migración 018 aún no existe. */
export async function esConfiable(): Promise<boolean | null> {
  try {
    const r = await fetch("/api/dispositivo", { cache: "no-store" });
    const { confiable } = (await r.json()) as { confiable: boolean | null };
    return confiable;
  } catch {
    return null; // sin conexión con el servidor: no se bloquea el ingreso
  }
}

/** Marca este dispositivo como de confianza. Solo funciona justo después de entrar con el correo. */
export async function confiarDispositivo(): Promise<void> {
  try {
    await fetch("/api/dispositivo", { method: "POST" });
  } catch {}
}

// ---------------------------------------------------------------------------
// Espera entre correos: 1 min, luego 2 min y después 5 min, para no saturar el
// correo ni el límite de Supabase. Se cuenta por dirección de correo en este navegador.

const CLAVE_ENVIOS = "easyfut:envios-correo";
const VENTANA_MS = 15 * 60 * 1000;
const ESPERAS = [60, 120, 300];

function leerEnvios(): Record<string, number[]> {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_ENVIOS) ?? "{}");
  } catch {
    return {};
  }
}

function recientes(correo: string): number[] {
  const ahora = Date.now();
  return (leerEnvios()[correo.toLowerCase()] ?? []).filter((t) => ahora - t < VENTANA_MS).sort((a, b) => a - b);
}

/** Segundos que faltan para poder pedir otro correo (0 = ya se puede). */
export function esperaParaEnviar(correo: string): number {
  const lista = recientes(correo);
  if (!lista.length) return 0;
  const espera = ESPERAS[Math.min(lista.length - 1, ESPERAS.length - 1)];
  const falta = Math.ceil((lista[lista.length - 1] + espera * 1000 - Date.now()) / 1000);
  return Math.max(0, falta);
}

export function registrarEnvio(correo: string) {
  try {
    const todos = leerEnvios();
    todos[correo.toLowerCase()] = [...recientes(correo), Date.now()];
    localStorage.setItem(CLAVE_ENVIOS, JSON.stringify(todos));
  } catch {}
}
