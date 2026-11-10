"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { leerCodigos } from "@/lib/misReservas";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { fmtFecha, soles } from "@/lib/horario";

type ReservaCuenta = {
  codigo: string;
  estado: string;
  inicio: string;
  fin: string;
  monto: number;
  expira_en: string | null;
  canchas: { nombre: string } | null;
};

const ESTADOS: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente de pago", clase: "bg-amber-50 text-amber-800" },
  confirmada: { texto: "Confirmada", clase: "bg-[#DCF5EA] text-[#0F7A55]" },
  cancelada: { texto: "Cancelada", clase: "bg-red-50 text-red-700" },
  expirada: { texto: "Expirada", clase: "bg-[#F4F4F4] text-[#5A5A5A]" },
};

const hora = (iso: string) => fmtFecha(iso, { hour: "2-digit", minute: "2-digit", hour12: false });

export default function MisReservas() {
  const router = useRouter();
  const [codigos, setCodigos] = useState<string[]>([]);
  const [codigo, setCodigo] = useState("");
  const [cuenta, setCuenta] = useState<"cargando" | "sin-sesion" | ReservaCuenta[]>("cargando");

  useEffect(() => {
    setCodigos(leerCodigos());
    const supabase = supabaseNavegador();
    if (!supabase) return setCuenta("sin-sesion");
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return setCuenta("sin-sesion");
      const { data } = await supabase
        .from("reservas")
        .select("codigo, estado, inicio, fin, monto, expira_en, canchas(nombre)")
        .eq("cliente_id", u.user.id)
        .order("inicio", { ascending: false })
        .limit(50);
      setCuenta((data ?? []) as unknown as ReservaCuenta[]);
    })();
  }, []);

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    const c = codigo.trim().toUpperCase();
    if (c) router.push(`/r/${encodeURIComponent(c)}`);
  }

  const enCuenta = Array.isArray(cuenta) ? cuenta : [];
  const soloLocales = codigos.filter((c) => !enCuenta.some((r) => r.codigo === c));

  return (
    <>
      {/* Reservas de la cuenta */}
      {cuenta === "cargando" ? (
        <div className="h-20 animate-pulse rounded-2xl bg-white" />
      ) : cuenta === "sin-sesion" ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 text-sm">
          <p className="text-[#4A4A4A]">Ingresa para ver tus reservas en cualquier dispositivo.</p>
          <Link
            href="/ingresar?next=/reservas"
            className="shrink-0 rounded-xl bg-[#6D28D9] px-4 py-2 font-bold text-white"
          >
            Ingresar
          </Link>
        </div>
      ) : (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold text-[#1B1B1B]">En tu cuenta</h2>
          {enCuenta.length === 0 ? (
            <p className="rounded-2xl bg-white p-4 text-sm text-[#5A5A5A]">
              Aún no tienes reservas.{" "}
              <Link href="/" className="font-bold text-[#6D28D9]">
                Buscar canchas
              </Link>
            </p>
          ) : (
            <ul className="divide-y divide-[#E3E3E3] overflow-hidden rounded-2xl bg-white">
              {enCuenta.map((r) => {
                const vencida =
                  r.estado === "pendiente" && r.expira_en && new Date(r.expira_en) < new Date();
                const e = ESTADOS[vencida ? "expirada" : r.estado] ?? ESTADOS.expirada;
                return (
                  <li key={r.codigo}>
                    <Link href={`/r/${r.codigo}`} className="flex items-center justify-between gap-3 p-4 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-bold">{r.canchas?.nombre}</span>
                        <span className="block text-[#5A5A5A] first-letter:uppercase">
                          {fmtFecha(r.inicio, { weekday: "short", day: "numeric", month: "short" })} ·{" "}
                          {hora(r.inicio)}–{hora(r.fin)}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${e.clase}`}>
                          {e.texto}
                        </span>
                        <span className="font-bold">{soles(r.monto)}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* Buscar por código */}
      <form onSubmit={buscar} className="flex flex-col gap-2">
        <label htmlFor="codigo" className="text-sm text-[#1B1B1B]">
          Consulta una reserva con su código
        </label>
        <div className="flex gap-2">
          <input
            id="codigo"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Ej. 3F9A1C0B"
            maxLength={8}
            className="min-w-0 flex-1 rounded-xl border border-[#E3E3E3] bg-white px-3 py-2 text-base uppercase"
          />
          <button type="submit" className="rounded-xl bg-[#6D28D9] px-4 py-2 font-bold text-white">
            Buscar
          </button>
        </div>
      </form>

      {/* Hechas sin cuenta en este dispositivo */}
      {soloLocales.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold text-[#1B1B1B]">Hechas en este dispositivo</h2>
          <ul className="divide-y divide-[#E3E3E3] rounded-2xl border border-[#E3E3E3] bg-white">
            {soloLocales.map((c) => (
              <li key={c}>
                <Link href={`/r/${c}`} className="flex justify-between p-4 text-sm text-[#1B1B1B]">
                  <span className="font-mono font-bold">{c}</span>
                  <span className="text-[#6D28D9]">Ver →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
