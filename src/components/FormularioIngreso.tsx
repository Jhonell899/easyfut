"use client";

import Link from "next/link";
import { useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import CampoTexto from "@/components/CampoTexto";

function traducir(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return "Correo o contraseña incorrectos.";
  if (/email not confirmed/i.test(msg))
    return "Aún no confirmaste tu correo. Revisa tu bandeja de entrada (y spam).";
  if (/rate limit|too many/i.test(msg)) return "Demasiados intentos. Espera un momento.";
  return "No pudimos iniciar sesión. Inténtalo de nuevo.";
}

export default function FormularioIngreso({
  siguiente,
  errorEnlace,
}: {
  siguiente?: string;
  errorEnlace?: boolean;
}) {
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [sinVerificar, setSinVerificar] = useState(false);
  const [error, setError] = useState<string | null>(
    errorEnlace ? "El enlace no es válido o ya expiró. Inicia sesión o regístrate otra vez." : null
  );

  async function ingresar(e: React.FormEvent) {
    e.preventDefault();
    const supabase = supabaseNavegador();
    if (!supabase) return setError("Falta configurar Supabase.");
    setEnviando(true);
    setError(null);
    setSinVerificar(false);

    const { error } = await supabase.auth.signInWithPassword({
      email: correo.trim(),
      password: clave,
    });
    if (error) {
      setEnviando(false);
      // Registro que nunca se verificó: esa cuenta no existe, se borra
      if (/email not confirmed/i.test(error.message)) {
        // Solo se borra si el registro tiene más de 10 minutos (migración 010)
        const { data: borrada } = await supabase.rpc("liberar_correo_no_verificado", { p_correo: correo.trim() });
        if (borrada === false)
          return setError("Aún no verificas tu correo. Escribe el código que te enviamos o espera unos minutos y regístrate de nuevo.");
        return setSinVerificar(true);
      }
      return setError(traducir(error.message));
    }
    // Navegación completa para que el servidor lea la nueva sesión
    window.location.assign(`/auth/destino?next=${encodeURIComponent(siguiente ?? "/")}`);
  }

  const sufijo = siguiente ? `?next=${encodeURIComponent(siguiente)}` : "";

  return (
    <form onSubmit={ingresar} className="flex flex-col gap-4">
      <CampoTexto
        etiqueta="Correo"
        type="email"
        autoComplete="email"
        value={correo}
        onChange={(e) => setCorreo(e.target.value)}
        placeholder="tucorreo@ejemplo.com"
        required
      />
      <CampoTexto
        etiqueta="Contraseña"
        type="password"
        autoComplete="current-password"
        value={clave}
        onChange={(e) => setClave(e.target.value)}
        required
      />

      {sinVerificar && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900" role="alert">
          <p>Ese registro no se terminó de verificar, así que la cuenta no existe. Regístrate de nuevo.</p>
          <Link
            href={`/registro${sufijo}`}
            className="shrink-0 rounded-xl bg-[#0B6E4F] px-4 py-2 font-bold text-white"
          >
            Registrarme
          </Link>
        </div>
      )}
      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={enviando}
        className="rounded-xl bg-[#0B6E4F] py-3 font-bold text-white disabled:opacity-50"
      >
        {enviando ? "Ingresando…" : "Ingresar"}
      </button>

      <p className="text-center text-sm text-[#5A5A5A]">
        ¿No tienes cuenta?{" "}
        <Link href={`/registro${sufijo}`} className="font-bold text-[#0B6E4F]">
          Crear cuenta
        </Link>
      </p>
      <p className="text-center text-sm">
        <Link href="/" className="text-[#5A5A5A] underline-offset-2 hover:underline">
          Seguir sin cuenta
        </Link>
      </p>
    </form>
  );
}
