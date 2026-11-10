"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import {
  aMinutos,
  diaSemana,
  fmtDuracion,
  fmtFecha,
  fmtMinutos,
  hoyLima,
  inicioDia,
  instante,
  soles,
  sumarDias,
} from "@/lib/horario";

type Franja = { dia_semana: number; hora_inicio: string; hora_fin: string; precio_hora: number };
type Reserva = {
  id: string;
  codigo: string;
  estado: "pendiente" | "confirmada" | "cancelada" | "expirada" | "bloqueo";
  inicio: string;
  fin: string;
  monto: number;
  nombre_cliente: string | null;
  celular_cliente: string | null;
  nota: string | null;
  expira_en: string | null;
  pago_avisado_en?: string | null;
};

const ACTIVOS = ["pendiente", "confirmada", "bloqueo"];
const DIA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** Minutos desde la medianoche de Lima de un instante. */
function minutosLima(iso: string, fecha: string) {
  return Math.round((new Date(iso).getTime() - inicioDia(fecha).getTime()) / 60000);
}

const hora = (iso: string) => fmtFecha(iso, { hour: "2-digit", minute: "2-digit", hour12: false });

type Nuevo = { ini: number; precioHora: number; finFranja: number };

export default function ReservasDia({
  canchaId,
  duracionTurno,
  franjas,
}: {
  canchaId: string;
  duracionTurno: number;
  franjas: Franja[];
}) {
  const hoy = hoyLima();
  const [desde, setDesde] = useState(hoy);
  const [fecha, setFecha] = useState(hoy);
  const [reservas, setReservas] = useState<Reserva[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [nuevo, setNuevo] = useState<Nuevo | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const supabase = supabaseNavegador();
    if (!supabase) return;
    setError(null);
    const { data, error } = await supabase
      .from("reservas")
      .select("*")
      .eq("cancha_id", canchaId)
      .gte("inicio", inicioDia(fecha).toISOString())
      .lt("inicio", inicioDia(sumarDias(fecha, 1)).toISOString())
      .order("inicio");
    if (error) setError("No pudimos cargar las reservas.");
    setReservas((data ?? []) as Reserva[]);
  }, [canchaId, fecha]);

  useEffect(() => {
    setReservas(null);
    cargar();
  }, [cargar, recarga]);

  // En vivo: nuevas reservas y avisos de pago aparecen sin recargar
  useEffect(() => {
    const supabase = supabaseNavegador();
    const canal = supabase
      ?.channel(`reservas-${canchaId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reservas", filter: `cancha_id=eq.${canchaId}` }, () => cargar())
      .subscribe();
    return () => {
      if (canal) supabase?.removeChannel(canal);
    };
  }, [canchaId, cargar]);

  // Turnos del día según el horario; los ocupados se reemplazan por su reserva
  const franjasDia = useMemo(
    () =>
      franjas
        .filter((f) => f.dia_semana === diaSemana(fecha))
        .map((f) => ({ ini: aMinutos(f.hora_inicio), fin: aMinutos(f.hora_fin) || 1440, precio: Number(f.precio_hora) })),
    [franjas, fecha]
  );

  const activas = (reservas ?? []).filter((r) => ACTIVOS.includes(r.estado));
  const inactivas = (reservas ?? []).filter((r) => !ACTIVOS.includes(r.estado));
  const ahora = Date.now();

  const filas = useMemo(() => {
    type Fila = { tipo: "libre"; ini: number; fin: number; precio: number; finFranja: number } | { tipo: "reserva"; r: Reserva; ini: number };
    const lista: Fila[] = activas.map((r) => ({ tipo: "reserva" as const, r, ini: minutosLima(r.inicio, fecha) }));
    for (const f of franjasDia) {
      for (let t = f.ini; t + duracionTurno <= f.fin; t += duracionTurno) {
        const choca = activas.some((r) => minutosLima(r.inicio, fecha) < t + duracionTurno && minutosLima(r.fin, fecha) > t);
        if (!choca) lista.push({ tipo: "libre", ini: t, fin: t + duracionTurno, precio: f.precio, finFranja: f.fin });
      }
    }
    return lista.sort((a, b) => a.ini - b.ini);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservas, franjasDia, duracionTurno, fecha]);

  const confirmado = activas.filter((r) => r.estado === "confirmada").reduce((s, r) => s + Number(r.monto), 0);
  const porCobrar = activas.filter((r) => r.estado === "pendiente").reduce((s, r) => s + Number(r.monto), 0);

  async function cambiarEstado(r: Reserva, estado: "confirmada" | "cancelada") {
    if (estado === "cancelada" && !confirm(`¿Cancelar la reserva de ${r.nombre_cliente ?? "este horario"}? El horario quedará libre.`)) return;
    setError(null);
    const supabase = supabaseNavegador();
    if (!supabase) return;
    setOcupado(r.id);
    const { error } = await supabase.from("reservas").update({ estado, expira_en: null }).eq("id", r.id);
    setOcupado(null);
    if (error)
      return setError(
        /reserva_vencida/.test(error.message)
          ? "Esa reserva venció: el cliente no avisó el pago a tiempo."
          : "No se pudo actualizar la reserva."
      );
    setRecarga((n) => n + 1);
  }

  async function quitarBloqueo(r: Reserva) {
    const supabase = supabaseNavegador();
    if (!supabase) return;
    setOcupado(r.id);
    const { error } = await supabase.from("reservas").delete().eq("id", r.id);
    setOcupado(null);
    if (error) return setError("No se pudo quitar el bloqueo.");
    setRecarga((n) => n + 1);
  }

  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(desde, i));

  return (
    <div className="flex flex-col gap-3">
      {/* Selector de día */}
      <div className="rounded-2xl bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={() => setDesde(sumarDias(desde, -7))} className="rounded-lg px-2 py-1 text-[#0B6E4F]" aria-label="Semana anterior">
            ‹
          </button>
          <span className="text-sm font-bold first-letter:uppercase">
            {fmtFecha(instante(fecha, 720), { weekday: "long", day: "numeric", month: "long" })}
          </span>
          <button type="button" onClick={() => setDesde(sumarDias(desde, 7))} className="rounded-lg px-2 py-1 text-[#0B6E4F]" aria-label="Semana siguiente">
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {dias.map((d) => {
            const sel = d === fecha;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setFecha(d)}
                className={`flex flex-col items-center rounded-xl py-1.5 text-xs ${
                  sel ? "bg-[#0B6E4F] font-bold text-white" : d === hoy ? "bg-[#E6EEEA] text-[#0B6E4F]" : "text-[#1B1B1B]"
                }`}
              >
                <span>{d === hoy ? "Hoy" : DIA[diaSemana(d)]}</span>
                <span className="text-base font-bold">{Number(d.slice(8))}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Resumen del día */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Dato valor={String(activas.filter((r) => r.estado !== "bloqueo").length)} etiqueta="Reservas" />
        <Dato valor={soles(confirmado)} etiqueta="Cobrado" />
        <Dato valor={soles(porCobrar)} etiqueta="Por cobrar" resaltar={porCobrar > 0} />
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {reservas === null ? (
        <div className="h-40 animate-pulse rounded-2xl bg-white" />
      ) : filas.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-sm text-[#5A5A5A]">
          Este día la cancha está cerrada. Puedes abrirlo en la pestaña Horarios.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filas.map((f) => {
            if (f.tipo === "libre") {
              const paso = instante(fecha, f.ini).getTime() < ahora;
              return (
                <li key={`l${f.ini}`} className={`flex items-center gap-3 rounded-xl border border-dashed border-[#D5DED9] bg-white/60 px-3 py-2.5 text-sm ${paso ? "opacity-50" : ""}`}>
                  <span className="w-24 font-bold tabular-nums">
                    {fmtMinutos(f.ini)}–{fmtMinutos(f.fin)}
                  </span>
                  <span className="flex-1 text-[#8A968F]">{paso ? "Pasó" : "Libre"}</span>
                  {!paso && (
                    <button
                      type="button"
                      onClick={() => setNuevo({ ini: f.ini, precioHora: f.precio, finFranja: f.finFranja })}
                      className="rounded-lg bg-[#E6EEEA] px-3 py-1.5 text-xs font-bold text-[#0B6E4F]"
                    >
                      + Agregar
                    </button>
                  )}
                </li>
              );
            }
            const r = f.r;
            const avisoPago = r.estado === "pendiente" && !!r.pago_avisado_en;
            const vencida = r.estado === "pendiente" && !avisoPago && r.expira_en && new Date(r.expira_en).getTime() < ahora;
            return (
              <li key={r.id} className="flex flex-col gap-2 rounded-xl bg-white p-3 text-sm shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="w-24 font-bold tabular-nums">
                    {hora(r.inicio)}–{hora(r.fin)}
                  </span>
                  <div className="min-w-0 flex-1">
                    {r.estado === "bloqueo" ? (
                      <p className="font-medium text-[#5A5A5A]">Bloqueado{r.nota ? ` · ${r.nota}` : ""}</p>
                    ) : (
                      <>
                        <p className="truncate font-bold">{r.nombre_cliente}</p>
                        <p className="text-xs text-[#5A5A5A]">
                          {r.celular_cliente && /^9\d{8}$/.test(r.celular_cliente) ? (
                            <a href={`https://wa.me/51${r.celular_cliente}`} target="_blank" rel="noopener noreferrer" className="text-[#0B6E4F] underline-offset-2 hover:underline">
                              WhatsApp {r.celular_cliente}
                            </a>
                          ) : (
                            r.celular_cliente
                          )}{" "}
                          · {soles(r.monto)} · #{r.codigo}
                        </p>
                        {r.nota && <p className="text-xs text-[#5A5A5A]">{r.nota}</p>}
                      </>
                    )}
                  </div>
                  <Estado estado={r.estado} vencida={!!vencida} avisoPago={avisoPago} />
                </div>
                <div className="flex justify-end gap-2">
                  {r.estado === "pendiente" && vencida && (
                    <Accion onClick={() => cambiarEstado(r, "cancelada")} disabled={ocupado === r.id}>
                      Liberar horario
                    </Accion>
                  )}
                  {r.estado === "pendiente" && !vencida && (
                    <>
                      <Accion onClick={() => cambiarEstado(r, "cancelada")} disabled={ocupado === r.id}>
                        {avisoPago ? "No me llegó" : "Cancelar"}
                      </Accion>
                      <Accion principal onClick={() => cambiarEstado(r, "confirmada")} disabled={ocupado === r.id}>
                        Confirmar pago
                      </Accion>
                    </>
                  )}
                  {r.estado === "confirmada" && (
                    <Accion onClick={() => cambiarEstado(r, "cancelada")} disabled={ocupado === r.id}>
                      Cancelar
                    </Accion>
                  )}
                  {r.estado === "bloqueo" && (
                    <Accion onClick={() => quitarBloqueo(r)} disabled={ocupado === r.id}>
                      Quitar bloqueo
                    </Accion>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {inactivas.length > 0 && (
        <details className="rounded-2xl bg-white p-3 text-sm shadow-sm">
          <summary className="cursor-pointer font-bold text-[#5A5A5A]">Canceladas y vencidas ({inactivas.length})</summary>
          <ul className="mt-2 divide-y divide-[#EFEFEF]">
            {inactivas.map((r) => (
              <li key={r.id} className="flex justify-between gap-3 py-2 text-[#5A5A5A]">
                <span>
                  {hora(r.inicio)}–{hora(r.fin)} · {r.nombre_cliente}
                </span>
                <span className="capitalize">{r.estado}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {nuevo && (
        <NuevaReserva
          canchaId={canchaId}
          fecha={fecha}
          duracionTurno={duracionTurno}
          datos={nuevo}
          onCerrar={() => setNuevo(null)}
          onCreada={() => {
            setNuevo(null);
            setRecarga((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

function Dato({ valor, etiqueta, resaltar }: { valor: string; etiqueta: string; resaltar?: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-2.5 shadow-sm">
      <p className={`text-base font-extrabold ${resaltar ? "text-amber-600" : "text-[#1B1B1B]"}`}>{valor}</p>
      <p className="text-xs text-[#5A5A5A]">{etiqueta}</p>
    </div>
  );
}

function Estado({ estado, vencida, avisoPago }: { estado: string; vencida: boolean; avisoPago: boolean }) {
  const [texto, clase] = vencida
    ? ["Vencida", "bg-[#F4F4F4] text-[#5A5A5A]"]
    : avisoPago
      ? ["Dice que pagó", "bg-[#18A058] text-white"]
      : estado === "pendiente"
      ? ["Esperando pago", "bg-amber-50 text-amber-800"]
      : estado === "confirmada"
        ? ["Pagada", "bg-[#E6EEEA] text-[#0B6E4F]"]
        : ["Bloqueo", "bg-[#F4F4F4] text-[#5A5A5A]"];
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${clase}`}>{texto}</span>;
}

function Accion({
  principal,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { principal?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${
        principal ? "bg-[#0B6E4F] text-white" : "border border-[#E3E3E3] text-[#1B1B1B]"
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Hoja para registrar una reserva presencial o bloquear un horario

function NuevaReserva({
  canchaId,
  fecha,
  duracionTurno,
  datos,
  onCerrar,
  onCreada,
}: {
  canchaId: string;
  fecha: string;
  duracionTurno: number;
  datos: Nuevo;
  onCerrar: () => void;
  onCreada: () => void;
}) {
  const [tipo, setTipo] = useState<"presencial" | "bloqueo">("presencial");
  const maxTurnos = Math.max(1, Math.floor((datos.finFranja - datos.ini) / duracionTurno));
  const [turnos, setTurnos] = useState(1);
  const [nombre, setNombre] = useState("");
  const [celular, setCelular] = useState("");
  const [nota, setNota] = useState("");
  const minutos = turnos * duracionTurno;
  const sugerido = Math.round(datos.precioHora * minutos * 100 / 60) / 100;
  const [monto, setMonto] = useState(String(sugerido));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMonto(String(Math.round(datos.precioHora * turnos * duracionTurno * 100 / 60) / 100)), [turnos, datos.precioHora, duracionTurno]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const supabase = supabaseNavegador();
    if (!supabase) return;
    if (tipo === "presencial" && nombre.trim().length < 2) return setError("Escribe el nombre de quien reserva.");
    setGuardando(true);
    setError(null);
    const { error } = await supabase.from("reservas").insert({
      cancha_id: canchaId,
      inicio: instante(fecha, datos.ini).toISOString(),
      fin: instante(fecha, datos.ini + minutos).toISOString(),
      estado: tipo === "bloqueo" ? "bloqueo" : "confirmada",
      nombre_cliente: tipo === "bloqueo" ? null : nombre.trim(),
      celular_cliente: tipo === "bloqueo" ? null : celular.replace(/\D/g, "") || "-",
      monto: tipo === "bloqueo" ? 0 : Number(monto) || 0,
      nota: nota.trim() || null,
    });
    setGuardando(false);
    if (error) {
      return setError(error.code === "23P01" ? "Ese horario ya está ocupado. Elige menos tiempo." : "No se pudo guardar. Inténtalo de nuevo.");
    }
    onCreada();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onCerrar}>
      <form
        onSubmit={guardar}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col gap-4 rounded-t-3xl bg-white p-5 sm:rounded-3xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold">Agregar a las {fmtMinutos(datos.ini)}</h3>
            <p className="text-sm text-[#5A5A5A] first-letter:uppercase">
              {fmtFecha(instante(fecha, 720), { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
          <button type="button" onClick={onCerrar} className="p-1 text-[#8A968F]" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#F2F5F3] p-1">
          {(["presencial", "bloqueo"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={`rounded-lg py-2 text-sm font-bold ${tipo === t ? "bg-white text-[#0B6E4F] shadow-sm" : "text-[#5A5A5A]"}`}
            >
              {t === "presencial" ? "Reserva presencial" : "Bloquear horario"}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Duración
          <select
            value={turnos}
            onChange={(e) => setTurnos(Number(e.target.value))}
            className="rounded-xl border border-[#E3E3E3] bg-white px-3 py-3 text-base font-normal"
          >
            {Array.from({ length: Math.min(maxTurnos, 8) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {fmtDuracion(n * duracionTurno)} (hasta las {fmtMinutos(datos.ini + n * duracionTurno)})
              </option>
            ))}
          </select>
        </label>

        {tipo === "presencial" ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Nombre
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="rounded-xl border border-[#E3E3E3] px-3 py-3 text-base font-normal" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Celular
                <input inputMode="numeric" value={celular} onChange={(e) => setCelular(e.target.value)} placeholder="Opcional" className="rounded-xl border border-[#E3E3E3] px-3 py-3 text-base font-normal" />
              </label>
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Monto cobrado (S/)
              <input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value.replace(/[^\d.]/g, ""))} className="rounded-xl border border-[#E3E3E3] px-3 py-3 text-base font-normal" />
            </label>
          </>
        ) : (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Motivo (opcional)
            <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. mantenimiento, torneo" className="rounded-xl border border-[#E3E3E3] px-3 py-3 text-base font-normal" />
          </label>
        )}

        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <button type="submit" disabled={guardando} className="rounded-xl bg-[#0B6E4F] py-3 font-bold text-white disabled:opacity-50">
          {guardando ? "Guardando…" : tipo === "presencial" ? "Guardar reserva (pagada)" : "Bloquear horario"}
        </button>
      </form>
    </div>
  );
}
