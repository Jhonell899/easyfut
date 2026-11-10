"use client";

import { useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";

/** Convierte la cuenta de comprador en rentador y abre el asistente. */
export default function HacermeRentador() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function convertir() {
    const supabase = supabaseNavegador();
    if (!supabase) return;
    setEnviando(true);
    setError(null);
    const { error } = await supabase.rpc("hacerme_rentador");
    if (error) {
      setEnviando(false);
      return setError(
        /hacerme_rentador|does not exist|schema cache/i.test(error.message)
          ? "Falta ejecutar la migración 004 en Supabase."
          : "No pudimos cambiar tu cuenta. Inténtalo de nuevo."
      );
    }
    window.location.assign("/panel/nueva");
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={convertir}
        disabled={enviando}
        className="rounded-xl bg-[#0B6E4F] py-3 font-bold text-white disabled:opacity-50"
      >
        {enviando ? "Un momento…" : "Convertir en cuenta de rentador"}
      </button>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
