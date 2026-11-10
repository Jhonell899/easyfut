"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { BotonBloquear, InsigniaHistorial, useHistorial } from "@/components/panel/HistorialCliente";
import { fmtFecha, soles } from "@/lib/horario";

type Pendiente = {
  id: string;
  codigo: string;
  inicio: string;
  fin: string;
  monto: number;
  nombre_cliente: string | null;
  celular_cliente: string | null;
  expira_en: string | null;
  pago_avisado_en: string | null;
  canchas: { id: string; nombre: string } | null;
};

const PLAZO_DUENO_MS = 10 * 60 * 1000; // tiempo sugerido para responder
const hora = (iso: string) => fmtFecha(iso, { hour: "2-digit", minute: "2-digit", hour12: false });
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Pitido corto para avisar al dueño (sin archivos de audio). */
function pitar() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.5);
  } catch {}
}

/**
 * Reservas que esperan al dueño, en vivo: aparecen al instante cuando un
 * cliente reserva o avisa "Ya pagué", con sonido y notificación del navegador.
 */
export default function PendientesEnVivo({ duenoId }: { duenoId: string }) {
  const [lista, setLista] = useState<Pendiente[] | null>(null);
  const [ahora, setAhora] = useState<number | null>(null);
  const [permiso, setPermiso] = useState<NotificationPermission | "no">("default");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const avisados = useRef<Set<string> | null>(null);
  const { mapa: historial, recargar: recargarHistorial } = useHistorial((lista ?? []).map((r) => r.celular_cliente));

  const cargar = useCallback(async () => {
    const supabase = supabaseNavegador();
    if (!supabase) return;
    const { data } = await supabase
      .from("reservas")
      .select("id, codigo, inicio, fin, monto, nombre_cliente, celular_cliente, expira_en, pago_avisado_en, canchas!inner(id, nombre, dueno_id)")
      .eq("canchas.dueno_id", duenoId)
      .eq("estado", "pendiente")
      .gte("fin", new Date().toISOString())
      .order("pago_avisado_en", { ascending: true, nullsFirst: false })
      .limit(20);
    const nuevas = (data ?? []) as unknown as Pendiente[];

    // Aviso solo por las que pasan a "dice que pagó" después de abrir el panel
    const conAviso = nuevas.filter((r) => r.pago_avisado_en).map((r) => r.id);
    if (avisados.current) {
      const recien = nuevas.filter((r) => r.pago_avisado_en && !avisados.current!.has(r.id));
      if (recien.length) {
        pitar();
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          for (const r of recien)
            new Notification("💸 Pago por confirmar", {
              body: `${r.nombre_cliente} dice que pagó ${soles(r.monto)} · ${r.canchas?.nombre} ${hora(r.inicio)}`,
              tag: r.id,
            });
        }
      }
    }
    avisados.current = new Set(conAviso);
    setLista(nuevas);
  }, [duenoId]);

  useEffect(() => {
    setAhora(Date.now());
    setPermiso(typeof Notification === "undefined" ? "no" : Notification.permission);
    cargar();
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    const respaldo = setInterval(cargar, 30000); // por si se corta la conexión en vivo

    const supabase = supabaseNavegador();
    const canal = supabase
      ?.channel(`pendientes-${duenoId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reservas" }, () => cargar())
      .subscribe();

    return () => {
      clearInterval(reloj);
      clearInterval(respaldo);
      if (canal) supabase?.removeChannel(canal);
    };
  }, [cargar, duenoId]);

  async function responder(r: Pendiente, estado: "confirmada" | "cancelada") {
    if (estado === "cancelada" && !confirm(`¿No te llegó el pago de ${r.nombre_cliente}? La reserva se cancelará y el horario quedará libre.`))
      return;
    const supabase = supabaseNavegador();
    if (!supabase) return;
    setOcupado(r.id);
    setError(null);
    const { error } = await supabase.from("reservas").update({ estado, expira_en: null }).eq("id", r.id);
    setOcupado(null);
    if (error)
      setError(
        /reserva_vencida/.test(error.message)
          ? "Esa reserva venció: el cliente no avisó el pago a tiempo."
          : "No se pudo actualizar la reserva."
      );
    cargar();
  }

  if (!lista) return null;

  const visibles = lista.filter(
    (r) => r.pago_avisado_en || (ahora !== null && r.expira_en && new Date(r.expira_en).getTime() > ahora)
  );

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-bold">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#18A058] opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#18A058]" />
          </span>
          Por confirmar
        </h2>
        {permiso === "default" && (
          <button
            type="button"
            onClick={async () => setPermiso(await Notification.requestPermission())}
            className="rounded-full bg-[#1B1B1B] px-3 py-1 text-xs font-bold text-white"
          >
            🔔 Activar avisos
          </button>
        )}
        {permiso === "denied" && <span className="text-xs text-[#8A968F]">Avisos bloqueados en el navegador</span>}
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {visibles.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-sm text-[#5A5A5A]">
          Nada pendiente. Cuando un cliente reserve o avise que pagó, aparecerá aquí al instante.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibles.map((r) => {
            const pago = !!r.pago_avisado_en;
            const restaDueno = pago && ahora !== null ? new Date(r.pago_avisado_en!).getTime() + PLAZO_DUENO_MS - ahora : 0;
            const restaCliente = !pago && ahora !== null && r.expira_en ? new Date(r.expira_en).getTime() - ahora : 0;
            return (
              <li
                key={r.id}
                className={`flex flex-col gap-3 rounded-2xl p-4 text-sm shadow-sm ${
                  pago ? "border-2 border-[#18A058] bg-white" : "bg-white/70"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold">
                      {r.nombre_cliente} · {soles(r.monto)}
                    </p>
                    <p className="text-[#5A5A5A] first-letter:uppercase">
                      {fmtFecha(r.inicio, { weekday: "short", day: "numeric", month: "short" })} · {hora(r.inicio)}–{hora(r.fin)}
                    </p>
                    <Link href={`/panel/c/${r.canchas?.id}`} className="text-xs text-[#8A968F] hover:underline">
                      {r.canchas?.nombre} · #{r.codigo}
                    </Link>
                    <InsigniaHistorial h={r.celular_cliente ? historial[r.celular_cliente] : undefined} />
                  </div>
                  {pago ? (
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${restaDueno > 0 ? "bg-[#18A058] text-white" : "bg-red-600 text-white"}`}>
                      {restaDueno > 0 ? `Dice que pagó · ${mmss(restaDueno)}` : "¡Confirma ya!"}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">
                      Esperando pago · {mmss(restaCliente)}
                    </span>
                  )}
                </div>

                {pago ? (
                  <div className="flex items-center gap-2">
                    <BotonBloquear
                      celular={r.celular_cliente}
                      nombre={r.nombre_cliente}
                      bloqueado={!!(r.celular_cliente && historial[r.celular_cliente]?.bloqueado_por_mi)}
                      onCambio={recargarHistorial}
                    />
                    <button
                      type="button"
                      onClick={() => responder(r, "cancelada")}
                      disabled={ocupado === r.id}
                      className="flex-1 rounded-xl border border-[#E3E3E3] py-2.5 font-bold disabled:opacity-50"
                    >
                      No me llegó
                    </button>
                    <button
                      type="button"
                      onClick={() => responder(r, "confirmada")}
                      disabled={ocupado === r.id}
                      className="flex-[2] rounded-xl bg-[#0B6E4F] py-2.5 font-bold text-white disabled:opacity-50"
                    >
                      Confirmar pago
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-[#5A5A5A]">
                    El cliente aún no avisa que pagó. Si lo hace, te llegará su WhatsApp y podrás confirmarlo aquí.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
