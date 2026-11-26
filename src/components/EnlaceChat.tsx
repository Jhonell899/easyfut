"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";

/**
 * Botón al chat de una reserva. Solo aparece si quien mira es el dueño o el jugador
 * de esa reserva y el chat ya se abrió (el dueño confirmó el pago en la app).
 */
export default function EnlaceChat({ codigo, texto = "Chat con el dueño" }: { codigo: string; texto?: string }) {
  const [chatId, setChatId] = useState<string | null>(null);

  useEffect(() => {
    supabaseNavegador()
      ?.rpc("chat_de_reserva", { p_codigo: codigo })
      .then(({ data }) => setChatId(typeof data === "string" ? data : null));
  }, [codigo]);

  if (!chatId) return null;
  return (
    <Link
      href={`/chat/${chatId}`}
      className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 text-sm shadow-sm hover:bg-[#FAFAFA]"
    >
      <span>
        <span className="block font-bold">💬 {texto}</span>
        <span className="block text-xs text-[#5A5A5A]">Coordina lo que necesites sobre tus reservas</span>
      </span>
      <span className="shrink-0 text-[#C4B5FD]" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}
