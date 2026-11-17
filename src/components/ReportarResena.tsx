"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

/** Botón para avisar a EasyFut de una reseña ofensiva o falsa. */
export default function ReportarResena({ id }: { id: string }) {
  const [hecho, setHecho] = useState(false);

  async function reportar() {
    const motivo = prompt("¿Por qué reportas esta reseña? (ofensiva, falsa, datos personales…)");
    if (motivo === null || !supabase) return;
    await supabase.rpc("reportar_resena", { p_id: id, p_motivo: motivo });
    setHecho(true);
  }

  return hecho ? (
    <span className="text-[11px] text-[#8A968F]">Reportada. Gracias.</span>
  ) : (
    <button type="button" onClick={reportar} className="text-[11px] text-[#8A968F] hover:underline">
      Reportar
    </button>
  );
}
