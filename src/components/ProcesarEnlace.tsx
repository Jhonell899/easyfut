"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { confiarDispositivo } from "@/lib/dispositivo";

const ERRORES: Record<string, string> = {
  otp_expired: "Este enlace ya venció o ya se usó. Pide uno nuevo desde la app.",
  access_denied: "Este enlace ya no es válido. Pide uno nuevo desde la app.",
  email_not_confirmed: "Tu correo todavía no está confirmado. Abre el último correo que te enviamos.",
};

/**
 * Recibe el enlace del correo (#access_token=…&refresh_token=… en la dirección),
 * inicia la sesión, deja el dispositivo de confianza y continúa a la app.
 */
export default function ProcesarEnlace() {
  const [error, setError] = useState<string | null>(null);
  const hecho = useRef(false);

  useEffect(() => {
    if (hecho.current) return;
    hecho.current = true;

    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const siguiente = query.get("next");
    const destino = siguiente?.startsWith("/") && !siguiente.startsWith("//") ? siguiente : "/";

    const codigoError = hash.get("error_code") ?? query.get("error_code") ?? hash.get("error") ?? query.get("error");
    if (codigoError) {
      return setError(ERRORES[codigoError] ?? hash.get("error_description")?.replace(/\+/g, " ") ?? "No pudimos usar este enlace.");
    }

    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");

    // Enlace antiguo (con ?code=): lo procesa el servidor
    if (!accessToken && query.get("code")) {
      window.location.replace(`/auth/callback?code=${encodeURIComponent(query.get("code")!)}&next=${encodeURIComponent(destino)}`);
      return;
    }

    if (!accessToken || !refreshToken) return setError("Este enlace está incompleto. Vuelve a pedirlo desde la app.");

    (async () => {
      const supabase = supabaseNavegador();
      if (!supabase) return setError("La app no está conectada a la base de datos.");
      const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (error) return setError("Este enlace ya venció o ya se usó. Pide uno nuevo desde la app.");
      // Quita la sesión de la dirección para que no quede en el historial
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      // Entró con el enlace de su correo: este dispositivo queda de confianza (migración 018)
      await confiarDispositivo();
      window.location.assign(`/auth/destino?next=${encodeURIComponent(destino)}`);
    })();
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-2xl" aria-hidden="true">
          ⚠️
        </span>
        <p className="text-sm text-[#4A4A4A]">{error}</p>
        <p className="text-xs text-[#8A968F]">
          Si estabas creando tu cuenta, es probable que ya haya quedado confirmada: prueba entrar con tu correo y
          contraseña.
        </p>
        <Link href="/ingresar" className="boton-morado w-full rounded-xl py-3 font-bold text-white">
          Ir a Ingresar
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center" aria-busy="true">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-[#EDE9FE] border-t-[#6D28D9]" aria-hidden="true" />
      <p className="font-bold">Entrando a EasyFut…</p>
    </div>
  );
}
