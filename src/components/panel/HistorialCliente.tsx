"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";

export type Historial = {
  celular: string;
  pagadas: number;
  vencidas: number;
  canceladas: number;
  bloqueado_por_mi: boolean;
  bloqueado_easyfut: boolean;
};

const valido = (c: string | null | undefined): c is string => !!c && /^9\d{8}$/.test(c);

/** Historial (en toda EasyFut) de los números que reservaron en tus canchas. */
export function useHistorial(celulares: (string | null | undefined)[]) {
  const [mapa, setMapa] = useState<Record<string, Historial>>({});
  const clave = [...new Set(celulares.filter(valido))].sort().join(",");

  const recargar = useCallback(async () => {
    const supabase = supabaseNavegador();
    if (!supabase || !clave) return setMapa({});
    const { data } = await supabase.rpc("historial_clientes", { p_celulares: clave.split(",") });
    const nuevo: Record<string, Historial> = {};
    for (const h of (data ?? []) as Historial[]) nuevo[h.celular] = h;
    setMapa(nuevo);
  }, [clave]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return { mapa, recargar };
}

/** "⚠ 2 vencidas sin pagar" / "✓ 5 pagadas" / "Nuevo". */
export function InsigniaHistorial({ h }: { h?: Historial }) {
  if (!h) return null;
  const chips: { texto: string; clase: string }[] = [];
  if (h.bloqueado_easyfut) chips.push({ texto: "⛔ Bloqueado por EasyFut", clase: "bg-red-600 text-white" });
  if (h.bloqueado_por_mi) chips.push({ texto: "⛔ Bloqueado", clase: "bg-red-50 text-red-700" });
  if (h.vencidas > 0)
    chips.push({
      texto: `⚠ ${h.vencidas} vencida${h.vencidas === 1 ? "" : "s"} sin pagar`,
      clase: h.vencidas >= 2 ? "bg-amber-100 text-amber-900" : "bg-amber-50 text-amber-800",
    });
  if (h.pagadas > 0)
    chips.push({ texto: `✓ ${h.pagadas} pagada${h.pagadas === 1 ? "" : "s"}`, clase: "bg-[#E6EEEA] text-[#0B6E4F]" });
  if (!chips.length) chips.push({ texto: "Cliente nuevo", clase: "bg-[#F4F4F4] text-[#5A5A5A]" });

  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {chips.map((c) => (
        <span key={c.texto} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${c.clase}`}>
          {c.texto}
        </span>
      ))}
    </span>
  );
}

/** Bloquea o desbloquea un número en las canchas del dueño. */
export function BotonBloquear({
  celular,
  nombre,
  bloqueado,
  onCambio,
}: {
  celular: string | null;
  nombre?: string | null;
  bloqueado: boolean;
  onCambio: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  if (!valido(celular)) return null;

  async function alternar() {
    const supabase = supabaseNavegador();
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    if (!bloqueado) {
      const motivo = prompt(
        `¿Bloquear a ${nombre ?? "este cliente"} (+51 ${celular})? Ya no podrá reservar en tus canchas.\n\nMotivo (opcional):`
      );
      if (motivo === null) return;
      setOcupado(true);
      const { error } = await supabase.from("bloqueos_clientes").insert({
        celular,
        dueno_id: user.id,
        creado_por: user.id,
        motivo: motivo.trim() || null,
      });
      setOcupado(false);
      if (error && error.code !== "23505") return alert("No se pudo bloquear. ¿Ejecutaste la migración 009?");
    } else {
      if (!confirm(`¿Desbloquear +51 ${celular}? Podrá volver a reservar en tus canchas.`)) return;
      setOcupado(true);
      await supabase.from("bloqueos_clientes").delete().eq("celular", celular).eq("dueno_id", user.id);
      setOcupado(false);
    }
    onCambio();
  }

  return (
    <button
      type="button"
      onClick={alternar}
      disabled={ocupado}
      className={`rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${
        bloqueado ? "border border-[#E3E3E3] text-[#1B1B1B]" : "text-red-700 hover:bg-red-50"
      }`}
    >
      {bloqueado ? "Desbloquear" : "Bloquear cliente"}
    </button>
  );
}
