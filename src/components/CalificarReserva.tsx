"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Estrellas from "@/components/Estrellas";

type Resena = { estrellas: number; comentario: string | null; respuesta: string | null };

const TEXTOS = ["", "Muy mala", "Mala", "Regular", "Buena", "Excelente"];

/** El jugador califica la cancha después de jugar (solo reservas pagadas y terminadas). */
export default function CalificarReserva({ codigo, canchaNombre }: { codigo: string; canchaNombre: string }) {
  const [existente, setExistente] = useState<Resena | null | undefined>(undefined);
  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disponible, setDisponible] = useState(true);

  useEffect(() => {
    supabase?.rpc("resena_de_reserva", { p_codigo: codigo }).then(({ data, error }) => {
      if (error) {
        setDisponible(false); // migración 017 pendiente
        return setExistente(null);
      }
      setExistente(((data ?? []) as Resena[])[0] ?? null);
    });
  }, [codigo]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || estrellas < 1) return;
    setEnviando(true);
    setError(null);
    const { error } = await supabase.rpc("crear_resena", {
      p_codigo: codigo,
      p_estrellas: estrellas,
      p_comentario: comentario,
    });
    setEnviando(false);
    if (error)
      return setError(
        /ya_calificada/.test(error.message)
          ? "Esta reserva ya tiene una reseña."
          : /no_calificable/.test(error.message)
            ? "Solo se puede calificar una reserva pagada, después del partido y dentro de los 30 días."
            : "No pudimos guardar tu reseña. Inténtalo de nuevo."
      );
    setExistente({ estrellas, comentario: comentario.trim() || null, respuesta: null });
  }

  if (!disponible || existente === undefined) return null;

  if (existente) {
    return (
      <section className="flex flex-col gap-2 rounded-2xl bg-white p-4 text-sm shadow-sm">
        <p className="font-bold">Tu reseña</p>
        <Estrellas valor={existente.estrellas} tam={20} />
        {existente.comentario && <p className="text-[#4A4A4A]">“{existente.comentario}”</p>}
        {existente.respuesta && (
          <p className="rounded-xl bg-[#F5F3FF] p-3 text-[#4C1D95]">
            <strong>Respuesta del dueño:</strong> {existente.respuesta}
          </p>
        )}
        <p className="text-xs text-[#8A968F]">¡Gracias! Tu opinión ayuda a otros jugadores.</p>
      </section>
    );
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3 rounded-2xl border-2 border-[#C4B5FD] bg-white p-4">
      <div>
        <h2 className="font-bold">¿Cómo estuvo {canchaNombre}?</h2>
        <p className="text-sm text-[#5A5A5A]">Tu reseña aparecerá con la marca “Jugó aquí”.</p>
      </div>

      <div className="flex items-center gap-1" role="radiogroup" aria-label="Calificación">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={estrellas === n}
            aria-label={`${n} estrella${n === 1 ? "" : "s"}`}
            onClick={() => setEstrellas(n)}
            className="p-0.5 transition-transform hover:scale-110"
          >
            <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z"
                fill={n <= estrellas ? "#F59E0B" : "#E5E7EB"}
              />
            </svg>
          </button>
        ))}
        <span className="ml-2 text-sm font-bold text-[#5A5A5A]">{TEXTOS[estrellas]}</span>
      </div>

      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value.slice(0, 500))}
        rows={3}
        placeholder="Cuéntales a otros jugadores: estado del grass, iluminación, atención… (opcional)"
        className="rounded-xl border border-[#E3E3E3] px-3 py-2.5 text-base outline-none focus:border-[#6D28D9]"
      />
      <p className="-mt-2 text-right text-[11px] text-[#8A968F]">{comentario.length}/500</p>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <button type="submit" disabled={estrellas < 1 || enviando} className="boton-morado rounded-xl py-3 font-bold text-white disabled:opacity-50">
        {enviando ? "Publicando…" : "Publicar reseña"}
      </button>
    </form>
  );
}
