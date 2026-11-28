"use client";

import Link from "next/link";
import { useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { correoTieneCuenta, cuentaBorrada } from "@/lib/cuentas";
import CampoTexto from "@/components/CampoTexto";
import VerificarCodigo from "@/components/VerificarCodigo";
import { esConfiable, esperaParaEnviar, registrarEnvio } from "@/lib/dispositivo";
import { clienteCorreo, enlaceDeVuelta } from "@/lib/clienteCorreo";

// Si no se pudo saber si el correo tiene cuenta (sin la migración 024 o sin conexión)
const INCORRECTOS = "Correo o contraseña incorrectos.";

function traducir(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return INCORRECTOS;
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
  // El correo no tiene cuenta: se ofrece crear una (el login nunca crea cuentas)
  const [sinCuenta, setSinCuenta] = useState(false);
  // Segundo paso: código por correo al entrar desde un dispositivo nuevo
  const [paso2, setPaso2] = useState(false);
  const [error, setError] = useState<string | null>(
    errorEnlace ? "Ese enlace ya se usó, venció o se abrió en otro navegador. Si estabas creando tu cuenta, probablemente ya quedó confirmada: ingresa con tu correo y contraseña." : null
  );

  async function ingresar(e: React.FormEvent) {
    e.preventDefault();
    const supabase = supabaseNavegador();
    if (!supabase) return setError("Falta configurar Supabase.");
    setEnviando(true);
    setError(null);
    setSinCuenta(false);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: correo.trim(),
      password: clave,
    });
    if (error) {
      // Registro que nunca se verificó: esa cuenta no existe, se borra
      if (/email not confirmed/i.test(error.message)) {
        // Solo se borra si el registro tiene más de 10 minutos (migración 010)
        const { data: borrada } = await supabase.rpc("liberar_correo_no_verificado", { p_correo: correo.trim() });
        setEnviando(false);
        if (borrada === false)
          return setError("Aún no verificas tu correo. Escribe el código que te enviamos o espera unos minutos y regístrate de nuevo.");
        return setSinCuenta(true);
      }
      // ¿No tiene cuenta o se equivocó de contraseña?
      if (/invalid login credentials/i.test(error.message)) {
        const tiene = await correoTieneCuenta(supabase, correo.trim());
        setEnviando(false);
        if (tiene === false) return setSinCuenta(true);
        if (tiene === true) return setError("Contraseña incorrecta.");
        return setError(INCORRECTOS);
      }
      setEnviando(false);
      return setError(traducir(error.message));
    }
    // Cuenta cuyos datos se borraron: no entra, aunque la contraseña coincida
    if (await cuentaBorrada(supabase, data.user.id)) {
      await supabase.auth.signOut({ scope: "local" });
      setEnviando(false);
      return setSinCuenta(true);
    }
    // Dispositivo nuevo: la contraseña no basta, se pide un código al correo
    if ((await esConfiable()) === false) {
      await supabase.auth.signOut();
      // Respeta la espera entre correos (1, 2 y 5 minutos): si hay uno reciente, usa ese
      if (esperaParaEnviar(correo.trim()) > 0) {
        setEnviando(false);
        return setPaso2(true);
      }
      registrarEnvio(correo.trim());
      const { error: errCodigo } = await (clienteCorreo() ?? supabase).auth.signInWithOtp({
        email: correo.trim(),
        options: { shouldCreateUser: false, emailRedirectTo: enlaceDeVuelta(siguiente ?? "/") },
      });
      setEnviando(false);
      if (errCodigo)
        return setError(
          /security purposes|rate limit|too many/i.test(errCodigo.message)
            ? "Ya te enviamos un código hace poco. Espera un minuto e inténtalo de nuevo."
            : "No pudimos enviarte el código de seguridad. Inténtalo de nuevo."
        );
      return setPaso2(true);
    }
    // Navegación completa para que el servidor lea la nueva sesión
    window.location.assign(`/auth/destino?next=${encodeURIComponent(siguiente ?? "/")}`);
  }

  const sufijo = siguiente ? `?next=${encodeURIComponent(siguiente)}` : "";

  if (paso2) {
    return (
      <VerificarCodigo
        correo={correo.trim()}
        destino={siguiente ?? "/"}
        tipo="email"
        explicacion="Estás entrando desde un dispositivo nuevo. Por seguridad, confirma que eres tú con el código que te enviamos."
        onVolver={() => setPaso2(false)}
      />
    );
  }

  return (
    <form onSubmit={ingresar} className="flex flex-col gap-4">
      <CampoTexto
        etiqueta="Correo"
        type="email"
        autoComplete="email"
        value={correo}
        onChange={(e) => {
          setCorreo(e.target.value);
          setSinCuenta(false);
        }}
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

      {sinCuenta && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900" role="alert">
          <p>
            <strong className="block">No tienes cuenta.</strong>
            ¿Quieres crear una?
          </p>
          <Link
            href={`/registro${sufijo}`}
            className="shrink-0 rounded-xl bg-[#6D28D9] px-4 py-2 font-bold text-white"
          >
            Crear cuenta
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
        className="rounded-xl bg-[#6D28D9] py-3 font-bold text-white disabled:opacity-50"
      >
        {enviando ? "Ingresando…" : "Ingresar"}
      </button>

      <p className="text-center text-sm text-[#5A5A5A]">
        ¿No tienes cuenta?{" "}
        <Link href={`/registro${sufijo}`} className="font-bold text-[#6D28D9]">
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
