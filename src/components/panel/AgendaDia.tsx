"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { aMinutos, diaSemana, fmtFecha, fmtMinutos, hoyLima, inicioDia, instante, soles, sumarDias } from "@/lib/horario";
import { NuevaReserva, type Nuevo } from "@/components/panel/ReservasDia";
import { BotonBloquear, InsigniaHistorial, useHistorial } from "@/components/panel/HistorialCliente";
import { enlaceAvisoConfirmada } from "@/lib/avisos";

type Franja = { dia_semana: number; hora_inicio: string; hora_fin: string; precio_hora: number };
type Cancha = { id: string; nombre: string; duracion_turno_min: number; activa: boolean; franjas: Franja[] };
type Reserva = {
  id: string;
  codigo: string;
  cancha_id: string;
  estado: "pendiente" | "confirmada" | "cancelada" | "expirada" | "bloqueo";
  inicio: string;
  fin: string;
  monto: number;
  nombre_cliente: string | null;
  celular_cliente: string | null;
  nota: string | null;
  expira_en: string | null;
  pago_avisado_en: string | null;
};

const PX_MIN = 1.1; // alto en píxeles por minuto (1 h ≈ 66 px)
const DIA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const hora = (iso: string) => fmtFecha(iso, { hour: "2-digit", minute: "2-digit", hour12: false });

/**
 * Agenda de un día con TODAS las canchas de un dueño: una columna por cancha.
 * La usan el dueño (puede bloquear clientes) y el administrador.
 */
export default function AgendaDia({ duenoId, puedeBloquearClientes }: { duenoId: string; puedeBloquearClientes: boolean }) {
  const hoy = hoyLima();
  const [desde, setDesde] = useState(hoy);
  const [fecha, setFecha] = useState(hoy);
  const [canchas, setCanchas] = useState<Cancha[] | null>(null);
  const [reservas, setReservas] = useState<Reserva[] | null>(null);
  const [ahora, setAhora] = useState<number | null>(null);
  const [nuevo, setNuevo] = useState<(Nuevo & { cancha: Cancha }) | null>(null);
  const [detalle, setDetalle] = useState<Reserva | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAhora(Date.now());
    const t = setInterval(() => setAhora(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Canchas del dueño con sus horarios
  useEffect(() => {
    supabaseNavegador()
      ?.from("canchas")
      .select("id, nombre, duracion_turno_min, activa, franjas:tarifas_horarias(dia_semana, hora_inicio, hora_fin, precio_hora)")
      .eq("dueno_id", duenoId)
      .order("created_at")
      .then(({ data, error }) => {
        if (error) setError("No pudimos cargar las canchas.");
        setCanchas((data ?? []) as Cancha[]);
      });
  }, [duenoId]);

  // Reservas del día de todas sus canchas
  const cargar = useCallback(async () => {
    const supabase = supabaseNavegador();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("reservas")
      .select("id, codigo, cancha_id, estado, inicio, fin, monto, nombre_cliente, celular_cliente, nota, expira_en, pago_avisado_en, canchas!inner(dueno_id)")
      .eq("canchas.dueno_id", duenoId)
      .in("estado", ["pendiente", "confirmada", "bloqueo"])
      .gte("inicio", inicioDia(fecha).toISOString())
      .lt("inicio", inicioDia(sumarDias(fecha, 1)).toISOString())
      .order("inicio");
    if (error) setError("No pudimos cargar las reservas.");
    setReservas((data ?? []) as unknown as Reserva[]);
  }, [duenoId, fecha]);

  useEffect(() => {
    setReservas(null);
    cargar();
  }, [cargar]);

  // En vivo: cualquier cambio en las reservas recarga la agenda
  useEffect(() => {
    const supabase = supabaseNavegador();
    const canal = supabase
      ?.channel(`agenda-${duenoId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reservas" }, () => cargar())
      .subscribe();
    return () => {
      if (canal) supabase?.removeChannel(canal);
    };
  }, [duenoId, cargar]);

  // Reservas que siguen vigentes (una pendiente vencida sin aviso ya no ocupa)
  const vigentes = useMemo(
    () =>
      (reservas ?? []).filter(
        (r) => !(r.estado === "pendiente" && !r.pago_avisado_en && r.expira_en && ahora && new Date(r.expira_en).getTime() < ahora)
      ),
    [reservas, ahora]
  );

  const minutos = (iso: string) => Math.round((new Date(iso).getTime() - inicioDia(fecha).getTime()) / 60000);
  const dow = diaSemana(fecha);

  // Rango de horas a dibujar: desde la primera apertura hasta el último cierre del día
  const rango = useMemo(() => {
    const inicios: number[] = [];
    const finales: number[] = [];
    for (const c of canchas ?? [])
      for (const f of c.franjas.filter((f) => f.dia_semana === dow)) {
        inicios.push(aMinutos(f.hora_inicio));
        finales.push(aMinutos(f.hora_fin) || 1440);
      }
    for (const r of vigentes) {
      inicios.push(minutos(r.inicio));
      finales.push(minutos(r.fin));
    }
    if (!inicios.length) return null;
    return { ini: Math.floor(Math.min(...inicios) / 60) * 60, fin: Math.ceil(Math.max(...finales) / 60) * 60 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canchas, vigentes, dow, fecha]);

  const historial = useHistorial(vigentes.map((r) => r.celular_cliente));

  const pagadas = vigentes.filter((r) => r.estado === "confirmada");
  const porCobrar = vigentes.filter((r) => r.estado === "pendiente");
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(desde, i));

  return (
    <div className="flex flex-col gap-3">
      {/* Día */}
      <div className="rounded-2xl bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={() => setDesde(sumarDias(desde, -7))} className="rounded-lg px-2 py-1 text-[#6D28D9]" aria-label="Semana anterior">
            ‹
          </button>
          <span className="text-sm font-bold first-letter:uppercase">
            {fmtFecha(instante(fecha, 720), { weekday: "long", day: "numeric", month: "long" })}
          </span>
          <button type="button" onClick={() => setDesde(sumarDias(desde, 7))} className="rounded-lg px-2 py-1 text-[#6D28D9]" aria-label="Semana siguiente">
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {dias.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setFecha(d)}
              className={`flex flex-col items-center rounded-xl py-1.5 text-xs ${
                d === fecha ? "bg-[#6D28D9] font-bold text-white" : d === hoy ? "bg-[#EDE9FE] text-[#6D28D9]" : "text-[#1B1B1B]"
              }`}
            >
              <span>{d === hoy ? "Hoy" : DIA[diaSemana(d)]}</span>
              <span className="text-base font-bold">{Number(d.slice(8))}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Dato valor={String(vigentes.filter((r) => r.estado !== "bloqueo").length)} etiqueta="Reservas" />
        <Dato valor={soles(pagadas.reduce((s, r) => s + Number(r.monto), 0))} etiqueta="Cobrado" />
        <Dato valor={soles(porCobrar.reduce((s, r) => s + Number(r.monto), 0))} etiqueta="Por cobrar" resaltar={porCobrar.length > 0} />
      </div>

      <Leyenda />

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {canchas === null || reservas === null ? (
        <div className="h-72 animate-pulse rounded-2xl bg-white" />
      ) : canchas.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-sm text-[#5A5A5A]">Aún no hay canchas publicadas.</p>
      ) : !rango ? (
        <p className="rounded-2xl bg-white p-4 text-sm text-[#5A5A5A]">Este día todas las canchas están cerradas.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white p-2 shadow-sm">
          <div className="flex min-w-max">
            {/* Eje de horas */}
            <div className="sticky left-0 z-[1] w-12 shrink-0 bg-white pt-10">
              <div className="relative" style={{ height: (rango.fin - rango.ini) * PX_MIN }}>
                {Array.from({ length: (rango.fin - rango.ini) / 60 + 1 }, (_, i) => rango.ini + i * 60).map((m) => (
                  <span key={m} className="absolute -translate-y-1/2 text-[11px] tabular-nums text-[#8A968F]" style={{ top: (m - rango.ini) * PX_MIN }}>
                    {fmtMinutos(m)}
                  </span>
                ))}
              </div>
            </div>

            {/* Una columna por cancha */}
            {canchas.map((c) => {
              const franjas = c.franjas
                .filter((f) => f.dia_semana === dow)
                .map((f) => ({ ini: aMinutos(f.hora_inicio), fin: aMinutos(f.hora_fin) || 1440, precio: Number(f.precio_hora) }));
              const suyas = vigentes.filter((r) => r.cancha_id === c.id);
              const libres: { ini: number; fin: number; precio: number; finFranja: number }[] = [];
              for (const f of franjas)
                for (let t = f.ini; t + c.duracion_turno_min <= f.fin; t += c.duracion_turno_min) {
                  const fin = t + c.duracion_turno_min;
                  if (!suyas.some((r) => minutos(r.inicio) < fin && minutos(r.fin) > t))
                    libres.push({
                      ini: t,
                      fin,
                      precio: f.precio,
                      // hasta el cierre o hasta la siguiente reserva, lo que llegue primero
                      finFranja: Math.min(f.fin, ...suyas.map((r) => minutos(r.inicio)).filter((m) => m >= fin)),
                    });
                }

              return (
                <div key={c.id} className="w-36 shrink-0 border-l border-[#EFEFEF] px-1">
                  <div className="flex h-10 flex-col justify-center px-1">
                    <p className="truncate text-sm font-bold" title={c.nombre}>
                      {c.nombre}
                    </p>
                    {!c.activa && <p className="text-[10px] text-[#8A968F]">Pausada</p>}
                  </div>
                  <div
                    className="relative"
                    style={{
                      height: (rango.fin - rango.ini) * PX_MIN,
                      backgroundImage: `repeating-linear-gradient(to bottom, #F2F2F2 0 1px, transparent 1px ${60 * PX_MIN}px)`,
                    }}
                  >
                    {/* Fuera de horario */}
                    {franjas.length === 0 && (
                      <p className="absolute inset-x-0 top-4 text-center text-xs text-[#8A968F]">Cerrada</p>
                    )}

                    {libres.map((l) => {
                      const paso = ahora !== null && instante(fecha, l.ini).getTime() < ahora;
                      return (
                        <button
                          key={`l${l.ini}`}
                          type="button"
                          disabled={paso}
                          onClick={() => setNuevo({ ini: l.ini, precioHora: l.precio, finFranja: l.finFranja, cancha: c })}
                          className="absolute inset-x-0.5 flex flex-col items-start justify-center rounded-lg border border-dashed border-[#CFDCD5] px-2 text-left text-[11px] text-[#5A5A5A] hover:border-[#6D28D9] hover:bg-[#F5F3FF] disabled:border-transparent disabled:bg-[#FAFAFA] disabled:text-[#C4C4C4]"
                          style={{ top: (l.ini - rango.ini) * PX_MIN + 1, height: (l.fin - l.ini) * PX_MIN - 2 }}
                        >
                          <span className="font-bold">{fmtMinutos(l.ini)}</span>
                          {!paso && <span>Libre · {soles(l.precio * (c.duracion_turno_min / 60))}</span>}
                        </button>
                      );
                    })}

                    {suyas.map((r) => {
                      const ini = minutos(r.inicio);
                      const fin = minutos(r.fin);
                      const estilo = estiloReserva(r);
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setDetalle(r)}
                          className={`absolute inset-x-0.5 overflow-hidden rounded-lg px-2 py-1 text-left text-[11px] shadow-sm ${estilo.clase}`}
                          style={{ top: (ini - rango.ini) * PX_MIN + 1, height: Math.max(24, (fin - ini) * PX_MIN - 2) }}
                        >
                          <span className="block font-bold">
                            {hora(r.inicio)}–{hora(r.fin)}
                          </span>
                          <span className="block truncate">{r.estado === "bloqueo" ? r.nota ?? "Bloqueado" : r.nombre_cliente}</span>
                          <span className="block truncate opacity-80">{estilo.texto}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {nuevo && (
        <NuevaReserva
          canchaId={nuevo.cancha.id}
          fecha={fecha}
          duracionTurno={nuevo.cancha.duracion_turno_min}
          datos={nuevo}
          onCerrar={() => setNuevo(null)}
          onCreada={() => {
            setNuevo(null);
            cargar();
          }}
        />
      )}

      {detalle && (
        <DetalleReserva
          r={detalle}
          cancha={canchas?.find((c) => c.id === detalle.cancha_id)?.nombre ?? ""}
          historial={historial}
          puedeBloquearClientes={puedeBloquearClientes}
          onCerrar={() => setDetalle(null)}
          onCambio={() => {
            setDetalle(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function estiloReserva(r: Reserva): { texto: string; clase: string } {
  if (r.estado === "bloqueo") return { texto: "Bloqueado", clase: "bg-[#E8E8E8] text-[#5A5A5A]" };
  if (r.estado === "confirmada") return { texto: `Pagada · ${soles(r.monto)}`, clase: "bg-[#0F7A55] text-white" };
  if (r.pago_avisado_en) return { texto: "Dice que pagó", clase: "bg-[#18A058] text-white ring-2 ring-[#C4B5FD]" };
  return { texto: "Esperando pago", clase: "bg-amber-100 text-amber-900" };
}

function Leyenda() {
  const items = [
    { texto: "Libre", clase: "border border-dashed border-[#CFDCD5] bg-white" },
    { texto: "Esperando pago", clase: "bg-amber-100" },
    { texto: "Dice que pagó", clase: "bg-[#18A058]" },
    { texto: "Pagada", clase: "bg-[#0F7A55]" },
    { texto: "Bloqueado", clase: "bg-[#E8E8E8]" },
  ];
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] text-[#5A5A5A]">
      {items.map((i) => (
        <span key={i.texto} className="flex items-center gap-1">
          <span className={`h-3 w-3 rounded ${i.clase}`} />
          {i.texto}
        </span>
      ))}
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

// ---------------------------------------------------------------------------
// Hoja con el detalle de una reserva y sus acciones

function DetalleReserva({
  r,
  cancha,
  historial,
  puedeBloquearClientes,
  onCerrar,
  onCambio,
}: {
  r: Reserva;
  cancha: string;
  historial: ReturnType<typeof useHistorial>;
  puedeBloquearClientes: boolean;
  onCerrar: () => void;
  onCambio: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const h = r.celular_cliente ? historial.mapa[r.celular_cliente] : undefined;

  async function actualizar(estado: "confirmada" | "cancelada") {
    if (estado === "cancelada" && !confirm(r.pago_avisado_en && r.estado === "pendiente"
      ? `¿No te llegó el pago de ${r.nombre_cliente}? La reserva se cancelará y contará como pago falso.`
      : `¿Cancelar la reserva de ${r.nombre_cliente}? El horario quedará libre.`)) return;
    const supabase = supabaseNavegador();
    if (!supabase) return;
    setOcupado(true);
    const { error } = await supabase.from("reservas").update({ estado, expira_en: null }).eq("id", r.id);
    setOcupado(false);
    if (error) return setError(/reserva_vencida/.test(error.message) ? "Esa reserva ya venció." : "No se pudo actualizar.");
    onCambio();
  }

  async function quitarBloqueo() {
    setOcupado(true);
    const { error } = await supabaseNavegador()!.from("reservas").delete().eq("id", r.id);
    setOcupado(false);
    if (error) return setError("No se pudo quitar el bloqueo.");
    onCambio();
  }

  const estilo = estiloReserva(r);
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onCerrar}>
      <div onClick={(e) => e.stopPropagation()} className="flex w-full max-w-md flex-col gap-4 rounded-t-3xl bg-white p-5 sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${estilo.clase}`}>{estilo.texto}</span>
            <h3 className="mt-2 text-lg font-bold">
              {r.estado === "bloqueo" ? "Horario bloqueado" : r.nombre_cliente}
            </h3>
            <p className="text-sm text-[#5A5A5A] first-letter:uppercase">
              {cancha} · {fmtFecha(r.inicio, { weekday: "long", day: "numeric", month: "short" })} · {hora(r.inicio)}–{hora(r.fin)}
            </p>
          </div>
          <button type="button" onClick={onCerrar} className="p-1 text-[#8A968F]" aria-label="Cerrar">
            ✕
          </button>
        </div>

        {r.estado !== "bloqueo" && (
          <div className="flex flex-col gap-1 text-sm">
            {r.celular_cliente && /^9\d{8}$/.test(r.celular_cliente) && (
              <a
                href={`https://wa.me/51${r.celular_cliente}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-[#128C4A] underline-offset-2 hover:underline"
              >
                WhatsApp +51 {r.celular_cliente}
              </a>
            )}
            <p className="text-[#5A5A5A]">
              {soles(r.monto)} · Código #{r.codigo}
            </p>
            <InsigniaHistorial h={h} />
          </div>
        )}
        {r.nota && <p className="text-sm text-[#5A5A5A]">{r.nota}</p>}
        {r.estado === "pendiente" && r.pago_avisado_en && (
          <p className="rounded-xl bg-[#F5F3FF] px-3 py-2 text-sm text-[#4C1D95]">
            Busca en tu Yape o Plin un pago de <strong>{soles(r.monto)}</strong> con el mensaje{" "}
            <strong className="font-mono">{r.codigo}</strong>.
          </p>
        )}

        {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <div className="flex flex-wrap gap-2">
          {r.estado === "pendiente" && (
            <>
              <button type="button" disabled={ocupado} onClick={() => actualizar("cancelada")} className="flex-1 rounded-xl border border-[#E3E3E3] py-3 font-bold disabled:opacity-50">
                {r.pago_avisado_en ? "No me llegó" : "Cancelar"}
              </button>
              <button type="button" disabled={ocupado} onClick={() => actualizar("confirmada")} className="flex-[2] rounded-xl bg-[#6D28D9] py-3 font-bold text-white disabled:opacity-50">
                Confirmar pago
              </button>
            </>
          )}
          {r.estado === "confirmada" && (
            <>
              <button type="button" disabled={ocupado} onClick={() => actualizar("cancelada")} className="flex-1 rounded-xl border border-[#E3E3E3] py-3 font-bold disabled:opacity-50">
                Cancelar reserva
              </button>
              {enlaceAvisoConfirmada(r, cancha) && (
                <a
                  href={enlaceAvisoConfirmada(r, cancha)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-[2] rounded-xl bg-[#25D366] py-3 text-center font-bold text-white"
                >
                  Avisar al cliente
                </a>
              )}
            </>
          )}
          {r.estado === "bloqueo" && (
            <button type="button" disabled={ocupado} onClick={quitarBloqueo} className="flex-1 rounded-xl border border-[#E3E3E3] py-3 font-bold disabled:opacity-50">
              Quitar bloqueo
            </button>
          )}
        </div>
        {puedeBloquearClientes && r.estado !== "bloqueo" && (
          <div className="flex justify-end">
            <BotonBloquear
              celular={r.celular_cliente}
              nombre={r.nombre_cliente}
              bloqueado={!!h?.bloqueado_por_mi}
              onCambio={historial.recargar}
            />
          </div>
        )}
      </div>
    </div>
  );
}
