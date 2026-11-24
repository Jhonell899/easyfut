import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { DEPORTES, ordenarModalidades } from "@/components/TarjetaCancha";
import AvisoConfig from "@/components/AvisoConfig";
import Reservar from "@/components/Reservar";
import Ubicacion from "@/components/Ubicacion";
import ContactoDueno from "@/components/ContactoDueno";
import PoliticaCancha from "@/components/PoliticaCancha";
import ResenasCancha, { type ResenaPublica } from "@/components/ResenasCancha";
import ConfianzaCancha, { type DatosConfianza } from "@/components/ConfianzaCancha";
import Logo from "@/components/Logo";
import { aMinutos, fmtMinutos, soles } from "@/lib/horario";

export const revalidate = 60;

type Franja = {
  id?: string;
  dia_semana?: number | null;
  hora_inicio?: string | null;
  hora_fin?: string | null;
  precio_hora: number;
};

type CanchaDetalle = {
  id: string;
  nombre: string;
  slug: string;
  deporte: string;
  direccion: string;
  distrito: string;
  fotos: string[] | null;
  descripcion?: string | null;
  superficie?: string | null;
  servicios?: string[] | null;
  duracion_turno_min?: number | null;
  latitud?: number | null;
  longitud?: number | null;
  modalidades?: number[] | null;
  politica_cancelacion?: string | null;
  franjas: Franja[];
};

const DIA_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0]; // lunes primero

function resumirHorario(franjas: Franja[]) {
  const grupos = new Map<string, { dias: number[]; ini: number; fin: number; precio: number }>();
  for (const f of franjas) {
    const ini = aMinutos(f.hora_inicio!);
    const fin = aMinutos(f.hora_fin!);
    const clave = `${ini}-${fin}-${f.precio_hora}`;
    const g = grupos.get(clave) ?? { dias: [], ini, fin, precio: Number(f.precio_hora) };
    if (!g.dias.includes(f.dia_semana!)) g.dias.push(f.dia_semana!);
    grupos.set(clave, g);
  }

  const etiquetaDias = (dias: number[]) => {
    const pos = dias.map((d) => ORDEN_SEMANA.indexOf(d)).sort((a, b) => a - b);
    if (pos.length === 7) return "Todos los días";
    const seguidos = pos.every((p, i) => i === 0 || p === pos[i - 1] + 1);
    const nombres = pos.map((p) => DIA_CORTO[ORDEN_SEMANA[p]]);
    if (seguidos && pos.length >= 3) return `${nombres[0]} a ${nombres.at(-1)}`;
    return nombres.join(", ");
  };

  return [...grupos.values()]
    .sort(
      (a, b) =>
        Math.min(...a.dias.map((d) => ORDEN_SEMANA.indexOf(d))) -
          Math.min(...b.dias.map((d) => ORDEN_SEMANA.indexOf(d))) || a.ini - b.ini
    )
    .map((g) => ({
      dias: etiquetaDias(g.dias),
      horas: `${fmtMinutos(g.ini)} – ${fmtMinutos(g.fin)}`,
      precio: g.precio,
    }));
}

export default async function DetalleCancha({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  if (!supabase) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 p-5">
        <AvisoConfig />
      </main>
    );
  }

  const { data, error } = await supabase
    .from("canchas")
    .select("*, franjas(*)")
    .eq("slug", slug)
    .eq("activa", true)
    .maybeSingle();

  if (error) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 p-5">
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          No pudimos cargar la cancha. Inténtalo de nuevo en unos minutos.
        </p>
      </main>
    );
  }
  if (!data) notFound();

  const cancha = data as CanchaDetalle;
  const { data: contactos } = await supabase.rpc("contacto_cancha", { p_cancha_id: cancha.id });
  const contacto = (contactos as { nombre: string | null; celular: string | null }[] | null)?.[0] ?? null;
  const fotos = cancha.fotos ?? [];
  const servicios = cancha.servicios ?? [];
  const modalidades = ordenarModalidades(cancha.modalidades);
  const franjas = (cancha.franjas ?? []).filter(
    (f) => f.dia_semana != null && f.hora_inicio && f.hora_fin
  );
  const resumen = resumirHorario(franjas);

  const [{ data: datosResenas }, { data: datosConfianza }] = await Promise.all([
    supabase
      .from("resenas")
      .select("id, estrellas, comentario, nombre, respuesta, created_at")
      .eq("cancha_id", cancha.id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.rpc("confianza_canchas", { p_ids: [cancha.id] }),
  ]);
  const resenas = (datosResenas ?? []) as ResenaPublica[];
  const confianza = ((datosConfianza ?? []) as DatosConfianza[])[0] ?? null;
  const hayResenas = datosResenas !== null;
  const desde = franjas.length ? Math.min(...franjas.map((f) => Number(f.precio_hora))) : null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 lg:pb-16">
      {/* Barra de navegación superior responsive */}
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8 py-3.5">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-700 hover:text-emerald-700 transition-colors"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 hover:bg-emerald-50">
              ←
            </span>
            <span>Volver a canchas</span>
          </Link>
          <Logo />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6">
        {/* Galería de fotos responsive */}
        <section className="relative overflow-hidden rounded-3xl bg-[#0A2E1F] shadow-md mb-6">
          {fotos.length > 0 ? (
            <div className="sin-scroll flex snap-x snap-mandatory overflow-x-auto">
              {fotos.map((src, i) => (
                <div key={src} className="relative h-64 sm:h-80 md:h-96 w-full shrink-0 snap-center">
                  <Image
                    src={src}
                    alt={`Foto ${i + 1} de ${cancha.nombre}`}
                    fill
                    priority={i === 0}
                    sizes="(max-width: 1024px) 100vw, 1200px"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="fondo-cancha flex h-60 sm:h-80 items-center justify-center">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="white" strokeOpacity="0.4" strokeWidth="1.5" aria-hidden="true">
                <rect x="2" y="5" width="20" height="14" rx="1" />
                <path d="M12 5v14" />
                <circle cx="12" cy="12" r="2.5" />
              </svg>
            </div>
          )}

          {fotos.length > 1 && (
            <span className="absolute bottom-4 right-4 rounded-full bg-slate-950/70 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
              {fotos.length} fotos
            </span>
          )}
        </section>

        {/* Layout Responsive de 2 Columnas (Desktop) / 1 Columna (Móvil) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Columna Izquierda: Información de la Cancha */}
          <div className="lg:col-span-7 xl:col-span-7 flex flex-col gap-6">
            <div className="flex flex-col gap-4 rounded-3xl bg-white p-6 sm:p-7 sombra-suave border border-slate-100">
              {/* Badges de Deporte y Superficie */}
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800 border border-emerald-200">
                  {DEPORTES[cancha.deporte] ?? cancha.deporte}
                </span>
                {cancha.superficie && (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                    {cancha.superficie}
                  </span>
                )}
              </div>

              {/* Título y Dirección */}
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{cancha.nombre}</h1>
                <p className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-500 mt-1.5">
                  <svg className="shrink-0 text-emerald-600" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" />
                    <circle cx="12" cy="10" r="2.5" />
                  </svg>
                  <span>{cancha.direccion}, {cancha.distrito}</span>
                </p>
              </div>

              {/* Indicadores de confianza */}
              {confianza && <ConfianzaCancha c={confianza} />}

              {/* Contacto del dueño */}
              {contacto?.nombre && (
                <div className="flex items-center gap-2.5 rounded-2xl bg-slate-50 p-3 text-xs sm:text-sm text-slate-700 border border-slate-100">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 font-bold text-xs">
                    {contacto.nombre.charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-1 truncate">
                    <span className="text-slate-500">Administrado por:</span>{" "}
                    <strong className="font-bold text-slate-900">{contacto.nombre}</strong>
                  </div>
                  {contacto.celular && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                      ✓ Verificado
                    </span>
                  )}
                </div>
              )}

              {/* Descripción */}
              {cancha.descripcion && (
                <div className="border-t border-slate-100 pt-4">
                  <h3 className="text-sm font-bold text-slate-900 mb-1.5">Acerca de esta cancha</h3>
                  <p className="text-sm leading-relaxed text-slate-600">{cancha.descripcion}</p>
                </div>
              )}

              {/* Servicios */}
              {servicios.length > 0 && (
                <div className="border-t border-slate-100 pt-4">
                  <h3 className="text-sm font-bold text-slate-900 mb-2">Servicios e instalaciones</h3>
                  <ul className="grid grid-cols-2 gap-2 text-xs sm:text-sm text-slate-700">
                    {servicios.map((s) => (
                      <li key={s} className="flex items-center gap-2">
                        <svg className="text-emerald-600 shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M5 12l5 5L20 7" />
                        </svg>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Modalidades */}
              {modalidades.length > 0 && (
                <div className="border-t border-slate-100 pt-4">
                  <h3 className="text-sm font-bold text-slate-900 mb-2">Modalidades de juego</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {modalidades.map((n) => (
                      <div
                        key={n}
                        className="flex flex-col items-center rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3 text-center"
                      >
                        <span className="text-xs font-semibold text-emerald-800">Fútbol</span>
                        <span className="text-2xl font-black text-emerald-950">{n}</span>
                        <span className="text-[10px] text-emerald-700">{n} vs {n}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Horario de atención resumido */}
            {resumen.length > 0 && (
              <div className="rounded-3xl bg-white p-6 sombra-suave border border-slate-100">
                <h3 className="text-base font-bold text-slate-900 mb-3">Tarifas y horarios habituales</h3>
                <ul className="flex flex-col divide-y divide-slate-100 text-sm">
                  {resumen.map((r) => (
                    <li key={`${r.dias}-${r.horas}`} className="flex justify-between items-center py-2.5">
                      <div>
                        <span className="font-semibold text-slate-800">{r.dias}</span>
                        <span className="text-slate-400 ml-2">({r.horas})</span>
                      </div>
                      <span className="font-black text-emerald-700">{soles(r.precio)}/h</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Política de cancelación */}
            {franjas.length > 0 && <PoliticaCancha politica={cancha.politica_cancelacion} />}

            {/* Ubicación y mapa */}
            <Ubicacion
              nombre={cancha.nombre}
              direccion={cancha.direccion}
              distrito={cancha.distrito}
              latitud={cancha.latitud}
              longitud={cancha.longitud}
            />

            {/* Contacto del dueño directo */}
            {contacto && <ContactoDueno nombre={contacto.nombre} celular={contacto.celular} cancha={cancha.nombre} />}

            {/* Reseñas de jugadores */}
            {hayResenas && <ResenasCancha resenas={resenas} />}
          </div>

          {/* Columna Derecha: Tarjeta de Reserva Flotante / Sticky en Desktop */}
          <div className="lg:col-span-5 xl:col-span-5 lg:sticky lg:top-20">
            <div className="rounded-3xl bg-white p-5 sm:p-7 sombra-fuerte border border-slate-100 flex flex-col gap-5">
              <div className="border-b border-slate-100 pb-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tarifa por turno</span>
                <div className="flex items-baseline justify-between mt-1">
                  <div className="text-3xl font-black text-slate-900">
                    {desde !== null ? soles(desde) : "Consultar"}
                    <span className="text-xs font-medium text-slate-500"> /hora</span>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
                    Pago con Yape / Plin
                  </span>
                </div>
              </div>

              {/* Formulario de reserva de horarios */}
              {franjas.length > 0 ? (
                <Reservar
                  canchaId={cancha.id}
                  turnoMin={cancha.duracion_turno_min ?? 60}
                  franjas={franjas.map((f) => ({
                    dia_semana: f.dia_semana!,
                    hora_inicio: f.hora_inicio!,
                    hora_fin: f.hora_fin!,
                    precio_hora: Number(f.precio_hora),
                  }))}
                />
              ) : (
                <p className="rounded-2xl bg-amber-50 p-4 text-xs text-amber-800 border border-amber-200">
                  Esta cancha no tiene turnos configurados para reservar en línea actualmente.
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
