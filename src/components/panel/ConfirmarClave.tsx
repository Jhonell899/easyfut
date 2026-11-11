"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";

/**
 * Pide la contraseña de la cuenta antes de una acción delicada (cambiar a dónde
 * llega el dinero). Al acertar, la sesión queda marcada como "contraseña reciente"
 * y la base de datos permite el cambio durante 10 minutos.
 */
export default function ConfirmarClave({
  motivo,
  onListo,
  onCancelar,
}: {
  motivo: string;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [clave, setClave] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    const supabase = supabaseNavegador();
    if (!supabase || !clave) return;
    setOcupado(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      setOcupado(false);
      return setError("Tu sesión expiró. Vuelve a ingresar.");
    }
    const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: clave });
    setOcupado(false);
    if (error) {
      setClave("");
      return setError(
        /invalid login credentials/i.test(error.message)
          ? "Contraseña incorrecta."
          : /rate limit|too many/i.test(error.message)
            ? "Demasiados intentos. Espera un momento."
            : "No pudimos comprobar tu contraseña. Inténtalo de nuevo."
      );
    }
    onListo();
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 sm:items-center" onClick={onCancelar}>
      <form
        onSubmit={confirmar}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col gap-4 rounded-t-3xl bg-white p-5 sm:rounded-3xl"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] text-[#6D28D9]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="4" y="10" width="16" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
          <div>
            <h3 className="text-lg font-bold">Confirma con tu contraseña</h3>
            <p className="text-sm text-[#5A5A5A]">{motivo}</p>
          </div>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Contraseña de tu cuenta
          <input
            ref={input}
            type="password"
            autoComplete="current-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            className="rounded-xl border border-[#E3E3E3] px-3 py-3 text-base font-normal outline-none focus:border-[#6D28D9]"
          />
        </label>

        {error && (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={onCancelar} className="flex-1 rounded-xl border border-[#E3E3E3] py-3 font-bold">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!clave || ocupado}
            className="boton-morado flex-[2] rounded-xl py-3 font-bold text-white disabled:opacity-50"
          >
            {ocupado ? "Comprobando…" : "Confirmar y guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
