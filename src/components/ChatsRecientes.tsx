"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { fmtFecha } from "@/lib/horario";

type Chat = {
  chat_id: string;
  soy: "dueno" | "cliente";
  otra_nombre: string | null;
  ultimo_texto: string | null;
  ultimo_en: string | null;
  no_leidos: number;
  abierto: boolean;
  proxima_cancha: string | null;
  proxima_inicio: string | null;
};

/** Chats del dueño o del jugador (uno por pareja), con los mensajes sin leer. */
export default function ChatsRecientes({ titulo = "Chats" }: { titulo?: string }) {
  const [chats, setChats] = useState<Chat[] | null>(null);

  useEffect(() => {
    const supabase = supabaseNavegador();
    if (!supabase) return;
    const cargar = () =>
      supabase.rpc("mis_chats").then(({ data, error }) => setChats(error ? [] : ((data ?? []) as Chat[])));
    cargar();
    // Si llega un mensaje nuevo a cualquiera de mis chats, actualizar la lista
    const canal = supabase
      .channel("mis-chats")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensajes_chat" }, () => cargar())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  if (!chats || chats.length === 0) return null;
  const sinLeer = chats.reduce((t, c) => t + Number(c.no_leidos), 0);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 font-bold">
        💬 {titulo}
        {sinLeer > 0 && <span className="rounded-full bg-[#6D28D9] px-2 text-xs font-extrabold text-white">{sinLeer}</span>}
      </h2>
      <ul className="divide-y divide-[#E3E3E3] overflow-hidden rounded-2xl bg-white shadow-sm">
        {chats.slice(0, 8).map((c) => (
          <li key={c.chat_id}>
            <Link href={`/chat/${c.chat_id}`} className="flex items-center justify-between gap-3 p-4 text-sm hover:bg-[#FAFAFA]">
              <span className="min-w-0">
                <span className="block truncate font-bold">{c.otra_nombre ?? (c.soy === "dueno" ? "Jugador" : "Dueño")}</span>
                {c.proxima_cancha && c.proxima_inicio && (
                  <span className="block truncate text-xs text-[#5A5A5A] first-letter:uppercase">
                    {fmtFecha(c.proxima_inicio, { weekday: "short", day: "numeric", month: "short" })} · {c.proxima_cancha}
                  </span>
                )}
                {c.ultimo_texto && <span className="block truncate text-xs text-[#8A968F]">{c.ultimo_texto}</span>}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {Number(c.no_leidos) > 0 ? (
                  <span className="rounded-full bg-[#6D28D9] px-2 py-0.5 text-[11px] font-extrabold text-white">
                    {c.no_leidos}
                  </span>
                ) : !c.abierto ? (
                  <span className="text-[11px] text-[#8A968F]">Cerrado</span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
