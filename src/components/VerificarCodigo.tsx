"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";

const ESPERA_REENVIO = 60; // segundos

function traducir(msg: string): string {
  if (/expired|invalid|token/i.test(msg)) return "El código no es válido o ya expiró. Pide uno nuevo.";
  if (/rate limit|too many|security purposes/i.test(msg))
    return "Espera un momento antes de pedir otro código.";
  return "No pudimos verificar el código. Inténtalo de nuevo.";
}

/**
 * Pide el código (token) que Supabase envió al correo y lo verifica.
 * Al verificar, Supabase crea la sesión y se continúa a `destino`.
 */
export default function VerificarCodigo({
  correo,
  destino,
  reenviarAlAbrir = false,
  onVolver,
}: {
  correo: string;
  destino: string;
  /** true cuando se llega desde el login (el código anterior pudo vencer). */
  reenviarAlAbrir?: boolean;
  onVolver?: () => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [verificando, setVerificando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [espera, setEspera] = useState(reenviarAlAbrir ? 0 : ESPERA_REENVIO);
  const inputRef = useRef<HTMLInputElement>(null);
  const yaReenviado = useRef(false);

  useEffect(() => inputRef.current?.focus(), []);

  // Cuenta regresiva para "Reenviar código"
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function reenviar() {
    const supabase = supabaseNavegador();
    if (!supabase) return;
    setError(null);
    setAviso(null);
    const { error } = await supabase.auth.resend({ type: "signup", email: correo });
    if (error) return setError(traducir(error.message));
    setAviso("Te enviamos un código nuevo.");
    setEspera(ESPERA_REENVIO);
  }

  useEffect(() => {
    if (reenviarAlAbrir && !yaReenviado.current) {
      yaReenviado.current = true;
      reenviar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reenviarAlAbrir]);

  async function verificar(token: string) {
    const supabase = supabaseNavegador();
    if (!supabase) return;
    setVerificando(true);
    setError(null);
    const { data, error } = await supabase.auth.verifyOtp({ email: correo, token, type: "signup" });
    if (error || !data.session) {
      setVerificando(false);
      setCodigo("");
      inputRef.current?.focus();
      return setError(traducir(error?.message ?? ""));
    }
    window.location.assign(`/auth/destino?next=${encodeURIComponent(destino)}`);
  }

  function cambiar(valor: string) {
    const limpio = valor.replace(/\D/g, "").slice(0, 8);
    setCodigo(limpio);
    // Verificación automática al completar 6 dígitos (o 8, si el proyecto usa 8)
    if (limpio.length === 6 || limpio.length === 8) verificar(limpio);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#E6EEEA]">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0B6E4F" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 7l9 6 9-6" />
          </svg>
        </span>
        <h2 className="text-lg font-bold">Ingresa el código</h2>
        <p className="text-sm text-[#5A5A5A]">
          Enviamos un código de verificación a{" "}
          <strong className="text-[#1B1B1B]">{correo}</strong>. Si no lo ves, revisa spam.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (codigo.length >= 6) verificar(codigo);
        }}
        className="flex flex-col gap-3"
      >
        <label className="sr-only" htmlFor="codigo-otp">
          Código de verificación
        </label>
        <input
          id="codigo-otp"
          ref={inputRef}
          value={codigo}
          onChange={(e) => cambiar(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="••••••"
          maxLength={8}
          disabled={verificando}
          className="w-full rounded-2xl border-2 border-[#E3E3E3] py-4 text-center font-mono text-3xl tracking-[0.5em] outline-none focus:border-[#0B6E4F] disabled:opacity-60"
        />

        {error && (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        {aviso && !error && (
          <p className="rounded-xl bg-[#E6EEEA] p-3 text-sm text-[#0B6E4F]" role="status">
            {aviso}
          </p>
        )}

        <button
          type="submit"
          disabled={codigo.length < 6 || verificando}
          className="rounded-xl bg-[#0B6E4F] py-3 font-bold text-white disabled:opacity-50"
        >
          {verificando ? "Verificando…" : "Verificar"}
        </button>
      </form>

      <div className="flex flex-col items-center gap-2 text-sm">
        <button
          type="button"
          onClick={reenviar}
          disabled={espera > 0}
          className="font-bold text-[#0B6E4F] disabled:font-normal disabled:text-[#8A968F]"
        >
          {espera > 0 ? `Reenviar código en ${espera} s` : "Reenviar código"}
        </button>
        {onVolver && (
          <button type="button" onClick={onVolver} className="text-[#5A5A5A]">
            Usar otro correo
          </button>
        )}
      </div>
    </div>
  );
}
