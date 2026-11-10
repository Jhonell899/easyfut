"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import ComprobarWhatsapp from "@/components/ComprobarWhatsapp";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { guardarCodigo } from "@/lib/misReservas";
import {
  aMinutos,
  diaSemana,
  fmtFecha,
  fmtMinutos,
  hoyLima,
  instante,
  soles,
  sumarDias,
} from "@/lib/horario";

export type FranjaReserva = {
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  precio_hora: number;
};

type Props = {
  canchaId: string;
  turnoMin: number;
  franjas: FranjaReserva[];
};

type Rango = { ini: number; fin: number }; // minutos desde medianoche
type Slot = { ini: number; fin: number; monto: number; ocupado: boolean };

const DIAS_VISIBLES = 14;

const ERRORES: Record<string, string> = {
  cancha_no_disponible: "Esta cancha ya no está disponible.",
  horario_pasado: "Ese horario ya pasó. Elige otro.",
  datos_invalidos: "Revisa tu nombre y celular (9 dígitos, empieza con 9).",
  duracion_invalida: "La duración elegida no es válida para esta cancha.",
  cruza_medianoche: "La reserva no puede pasar de la medianoche.",
  fuera_de_horario: "Ese horario está fuera de la atención de la cancha.",
  horario_ocupado: "Alguien acaba de reservar ese horario. Elige otro.",
  // Protección contra reservas falsas (migración 009)
  cliente_bloqueado: "Este número no puede hacer reservas aquí. Si crees que es un error, comunícate con la cancha.",
  pendiente_activa:
    "Ya tienes una reserva sin pagar. Págala y avisa al dueño, o espera a que venza (15 minutos), para separar otra. La encuentras en \"Mis reservas\".",
  limite_conexion: "Hay demasiadas reservas sin pagar desde esta conexión. Paga una o espera a que venzan.",
  demasiadas_vencidas:
    "Dejaste vencer varias reservas sin pagar esta semana, así que no puedes reservar por unos días.",
};

function mensajeError(msg: string): string {
  const clave = Object.keys(ERRORES).find((k) => msg.includes(k));
  return clave ? ERRORES[clave] : "No pudimos crear la reserva. Inténtalo de nuevo.";
}

function textoDuracion(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!m) return h === 1 ? "1 hora" : `${h} horas`;
  return h ? `${h} h ${m} min` : `${m} min`;
}

const diaLargo = (f: string) =>
  fmtFecha(`${f}T12:00:00Z`, { weekday: "long", day: "numeric", month: "long" });

const conMayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const CLAVE_WHATSAPP = "easyfut:whatsapp-confirmados";

export default function Reservar({ canchaId, turnoMin, franjas }: Props) {
  const router = useRouter();
  const supabase = supabaseNavegador();
  const ruta = usePathname();
  const formRef = useRef<HTMLFormElement>(null);

  const [hoy] = useState(hoyLima);
  const diasConAtencion = useMemo(() => new Set(franjas.map((f) => f.dia_semana)), [franjas]);
  const fechas = useMemo(
    () => Array.from({ length: DIAS_VISIBLES }, (_, i) => sumarDias(hoy, i)),
    [hoy]
  );

  const [fecha, setFecha] = useState(
    () => fechas.find((f) => diasConAtencion.has(diaSemana(f))) ?? hoy
  );
  const [duracion, setDuracion] = useState(turnoMin);
  const [elegido, setElegido] = useState<Slot | null>(null);
  const [ocupados, setOcupados] = useState<Rango[] | null>(null);
  const [errorCarga, setErrorCarga] = useState(false);
  const [ahora, setAhora] = useState(0);
  const [recarga, setRecarga] = useState(0);

  const [nombre, setNombre] = useState("");
  const [celular, setCelular] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conCuenta, setConCuenta] = useState<boolean | null>(null);

  // Si hay sesión, autocompletar con los datos del perfil
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return setConCuenta(false);
      setConCuenta(true);
      const { data: p } = await supabase
        .from("perfiles")
        .select("nombre, celular")
        .eq("id", data.user.id)
        .maybeSingle();
      if (p?.nombre) setNombre((n) => n || p.nombre);
      if (p?.celular) setCelular((c) => c || p.celular);
    })();
  }, [supabase]);

  // Horarios ocupados del día elegido
  useEffect(() => {
    let cancelado = false;
    setOcupados(null);
    setErrorCarga(false);
    setElegido(null);
    setAhora(Date.now());

    (async () => {
      if (!supabase) return setErrorCarga(true);
      const desde = instante(fecha, 0);
      const { data, error } = await supabase.rpc("horarios_ocupados", {
        p_cancha_id: canchaId,
        p_desde: desde.toISOString(),
        p_hasta: instante(fecha, 1440).toISOString(),
      });
      if (cancelado) return;
      if (error) return setErrorCarga(true);
      setOcupados(
        (data as { inicio: string; fin: string }[]).map((r) => ({
          ini: (new Date(r.inicio).getTime() - desde.getTime()) / 60_000,
          fin: (new Date(r.fin).getTime() - desde.getTime()) / 60_000,
        }))
      );
    })();

    return () => {
      cancelado = true;
    };
  }, [supabase, canchaId, fecha, recarga]);

  useEffect(() => setElegido(null), [duracion]);

  // Al elegir un horario, llevar al cliente al formulario
  useEffect(() => {
    if (elegido) formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [elegido]);

  const franjasDelDia = useMemo(
    () =>
      franjas
        .filter((f) => f.dia_semana === diaSemana(fecha))
        .sort((a, b) => aMinutos(a.hora_inicio) - aMinutos(b.hora_inicio)),
    [franjas, fecha]
  );

  const duraciones = useMemo(() => {
    const maxFranja = Math.max(
      0,
      ...franjasDelDia.map((f) => aMinutos(f.hora_fin) - aMinutos(f.hora_inicio))
    );
    return [1, 2, 3].map((k) => k * turnoMin).filter((d) => d <= maxFranja);
  }, [franjasDelDia, turnoMin]);

  // Horarios futuros (los pasados no se muestran)
  const slots = useMemo<Slot[]>(() => {
    if (!ocupados) return [];
    const lista: Slot[] = [];
    for (const f of franjasDelDia) {
      const a = aMinutos(f.hora_inicio);
      const b = aMinutos(f.hora_fin);
      for (let ini = a; ini + duracion <= b; ini += turnoMin) {
        if (instante(fecha, ini).getTime() <= ahora) continue;
        const fin = ini + duracion;
        lista.push({
          ini,
          fin,
          monto: Math.round((Number(f.precio_hora) * duracion * 100) / 60) / 100,
          ocupado: ocupados.some((o) => o.ini < fin && o.fin > ini),
        });
      }
    }
    return lista;
  }, [ocupados, franjasDelDia, duracion, turnoMin, fecha, ahora]);

  const siguienteDia = fechas.find(
    (f) => f > fecha && diasConAtencion.has(diaSemana(f))
  );

  const celularLimpio = celular.replace(/\D/g, "");
  const nombreValido = nombre.trim().length >= 2;
  const celularValido = /^9\d{8}$/.test(celularLimpio);

  // Números que este navegador ya confirmó que tienen WhatsApp (no volver a preguntar)
  const [conWhatsapp, setConWhatsapp] = useState<string[]>([]);
  useEffect(() => {
    try {
      setConWhatsapp(JSON.parse(localStorage.getItem(CLAVE_WHATSAPP) ?? "[]"));
    } catch {}
  }, []);
  const whatsappOk = celularValido && conWhatsapp.includes(celularLimpio);
  function marcarWhatsapp(si: boolean) {
    const lista = si
      ? [...new Set([...conWhatsapp, celularLimpio])]
      : conWhatsapp.filter((n) => n !== celularLimpio);
    setConWhatsapp(lista);
    try {
      localStorage.setItem(CLAVE_WHATSAPP, JSON.stringify(lista.slice(-5)));
    } catch {}
  }

  async function reservar(e: React.FormEvent) {
    e.preventDefault();
    if (!elegido || !supabase || !nombreValido || !celularValido || !whatsappOk) return;
    setEnviando(true);
    setError(null);

    const { data, error } = await supabase.rpc("crear_reserva", {
      p_cancha_id: canchaId,
      p_inicio: instante(fecha, elegido.ini).toISOString(),
      p_fin: instante(fecha, elegido.fin).toISOString(),
      p_nombre: nombre.trim(),
      p_celular: celularLimpio,
    });

    const codigo = (data as { r_codigo: string }[] | null)?.[0]?.r_codigo;
    if (error || !codigo) {
      setEnviando(false);
      setError(mensajeError(error?.message ?? ""));
      if (error?.message.includes("horario_ocupado")) setRecarga((n) => n + 1);
      return;
    }

    guardarCodigo(codigo);
    router.push(`/r/${codigo}`);
  }

  return (
    <section className="flex flex-col gap-6" aria-labelledby="titulo-reserva">
      <h2 id="titulo-reserva" className="text-xl font-bold text-[#1B1B1B]">
        Reserva tu horario
      </h2>

      {/* Paso 1: día */}
      <Paso numero={1} titulo="Elige el día" detalle={<span className="capitalize">{fmtFecha(`${fecha}T12:00:00Z`, { month: "long" })}</span>}>
        <div className="sin-scroll -mx-5 flex gap-2 overflow-x-auto px-5">
          {fechas.map((f) => {
            const activo = f === fecha;
            const atiende = diasConAtencion.has(diaSemana(f));
            return (
              <button
                key={f}
                type="button"
                disabled={!atiende}
                onClick={() => setFecha(f)}
                aria-pressed={activo}
                className={`flex w-14 shrink-0 flex-col items-center gap-0.5 rounded-2xl border py-2.5 transition-colors ${
                  activo
                    ? "border-[#0B6E4F] bg-[#0B6E4F] text-white"
                    : "border-[#E3E3E3] bg-white text-[#1B1B1B] hover:border-[#0B6E4F]"
                } disabled:border-transparent disabled:bg-[#F4F4F4] disabled:text-[#B0B0B0]`}
              >
                <span className={`text-[11px] capitalize ${activo ? "text-white/80" : "text-[#5A5A5A]"}`}>
                  {f === hoy ? "Hoy" : fmtFecha(`${f}T12:00:00Z`, { weekday: "short" }).replace(".", "")}
                </span>
                <span className="text-lg font-bold leading-none">{Number(f.slice(8))}</span>
              </button>
            );
          })}
        </div>
      </Paso>

      {/* Paso 2: duración */}
      {duraciones.length > 1 && (
        <Paso numero={2} titulo="¿Cuánto tiempo vas a jugar?">
          <div className="grid grid-cols-3 gap-2">
            {duraciones.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuracion(d)}
                aria-pressed={d === duracion}
                className={`rounded-xl border py-2.5 text-sm transition-colors ${
                  d === duracion
                    ? "border-[#0B6E4F] bg-[#E6EEEA] font-bold text-[#0B6E4F]"
                    : "border-[#E3E3E3] text-[#1B1B1B] hover:border-[#0B6E4F]"
                }`}
              >
                {textoDuracion(d)}
              </button>
            ))}
          </div>
        </Paso>
      )}

      {/* Paso 3: hora */}
      <Paso numero={duraciones.length > 1 ? 3 : 2} titulo="Elige la hora de inicio">
        {errorCarga ? (
          <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
            No pudimos cargar la disponibilidad. Recarga la página.
          </p>
        ) : !ocupados ? (
          <div className="grid grid-cols-3 gap-2" aria-label="Cargando horarios">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-[60px] animate-pulse rounded-xl bg-[#F4F4F4]" />
            ))}
          </div>
        ) : slots.length === 0 || slots.every((s) => s.ocupado) ? (
          <div className="flex flex-col items-start gap-3 rounded-xl bg-[#F7F8F7] p-4 text-sm text-[#4A4A4A]">
            <p>
              {slots.length === 0 && fecha === hoy
                ? "Ya no quedan horarios para hoy."
                : "No hay horarios libres este día."}
            </p>
            {siguienteDia && (
              <button
                type="button"
                onClick={() => setFecha(siguienteDia)}
                className="font-bold text-[#0B6E4F]"
              >
                Ver el {diaLargo(siguienteDia)} →
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {slots.map((s) => {
              const activo = elegido?.ini === s.ini;
              return (
                <button
                  key={s.ini}
                  type="button"
                  disabled={s.ocupado}
                  onClick={() => setElegido(s)}
                  aria-pressed={activo}
                  className={`flex flex-col items-center rounded-xl border py-2 transition-colors ${
                    activo
                      ? "border-[#0B6E4F] bg-[#0B6E4F] text-white"
                      : "border-[#E3E3E3] bg-white text-[#1B1B1B] hover:border-[#0B6E4F]"
                  } disabled:border-transparent disabled:bg-[#F4F4F4] disabled:text-[#B0B0B0]`}
                >
                  <span className="text-base font-bold">{fmtMinutos(s.ini)}</span>
                  <span className={`text-[11px] ${activo ? "text-white/80" : s.ocupado ? "" : "text-[#5A5A5A]"}`}>
                    {s.ocupado ? "Ocupado" : soles(s.monto)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Paso>

      {/* Paso 4: datos */}
      {elegido && (
        <form id="form-reserva" ref={formRef} onSubmit={reservar} className="scroll-mt-6">
          <Paso numero={duraciones.length > 1 ? 4 : 3} titulo="Tus datos">
            <div className="flex flex-col gap-3">
              <Campo etiqueta="Nombre y apellido">
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  autoComplete="name"
                  placeholder="Ej. Juan Pérez"
                  required
                  className="w-full rounded-xl border border-[#E3E3E3] px-3 py-3 text-base outline-none focus:border-[#0B6E4F]"
                />
              </Campo>
              <Campo
                etiqueta="Celular"
                ayuda={
                  celular && !celularValido
                    ? "Debe tener 9 dígitos y empezar con 9."
                    : "Debe tener WhatsApp: por ahí coordinas el pago con el dueño."
                }
                error={!!celular && !celularValido}
              >
                <input
                  value={celular}
                  onChange={(e) => setCelular(e.target.value)}
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="987 654 321"
                  maxLength={11}
                  required
                  className="w-full rounded-xl border border-[#E3E3E3] px-3 py-3 text-base outline-none focus:border-[#0B6E4F]"
                />
              </Campo>
              {celularValido && (
                <ComprobarWhatsapp numero={celularLimpio} confirmado={whatsappOk} onCambio={marcarWhatsapp} />
              )}
              {conCuenta === false && (
                <p className="rounded-xl bg-[#F7F8F7] p-3 text-xs text-[#4A4A4A]">
                  <Link href={`/ingresar?next=${encodeURIComponent(ruta)}`} className="font-bold text-[#0B6E4F]">
                    Ingresa
                  </Link>{" "}
                  para guardar esta reserva en tu cuenta. También puedes reservar sin cuenta.
                </p>
              )}
              {error && (
                <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
                  {error}
                </p>
              )}
            </div>
          </Paso>
        </form>
      )}

      {/* Barra fija con el resumen y el botón */}
      {elegido && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[#E3E3E3] bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center justify-between gap-4 px-5 py-3">
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium text-[#1B1B1B]">{conMayuscula(diaLargo(fecha))}</p>
              <p className="text-[#5A5A5A]">
                {fmtMinutos(elegido.ini)} – {fmtMinutos(elegido.fin)} ·{" "}
                <span className="font-bold text-[#1B1B1B]">{soles(elegido.monto)}</span>
              </p>
            </div>
            <button
              type="submit"
              form="form-reserva"
              disabled={!nombreValido || !celularValido || !whatsappOk || enviando}
              className="shrink-0 rounded-xl bg-[#0B6E4F] px-5 py-3 font-bold text-white transition-opacity disabled:opacity-40"
            >
              {enviando ? "Reservando…" : "Reservar"}
            </button>
          </div>
          <p className="mx-auto max-w-xl px-5 pb-3 text-[11px] text-[#5A5A5A]">
            Separamos tu horario por 15 minutos para que realices el pago.
          </p>
        </div>
      )}
    </section>
  );
}

function Paso({
  numero,
  titulo,
  detalle,
  children,
}: {
  numero: number;
  titulo: string;
  detalle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#1B1B1B] text-xs font-bold text-white">
          {numero}
        </span>
        <h3 className="flex-1 font-bold text-[#1B1B1B]">{titulo}</h3>
        {detalle && <span className="text-sm text-[#5A5A5A]">{detalle}</span>}
      </div>
      {children}
    </div>
  );
}

function Campo({
  etiqueta,
  ayuda,
  error,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-[#1B1B1B]">
      {etiqueta}
      {children}
      {ayuda && (
        <span className={`text-xs font-normal ${error ? "text-red-700" : "text-[#5A5A5A]"}`}>
          {ayuda}
        </span>
      )}
    </label>
  );
}
