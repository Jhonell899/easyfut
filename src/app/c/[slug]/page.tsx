import Link from "next/link";
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

/** Agrupa días con el mismo horario y precio: "Lun a Vie · 16:00 – 24:00 · S/ 60". */
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
  // Dueño de la cancha: el nombre siempre; el celular solo si su WhatsApp está aprobado (migración 014)
  const { data: contactos } = await supabase.rpc("contacto_cancha", { p_cancha_id: cancha.id });
  const contacto = (contactos as { nombre: string | null; celular: string | null }[] | null)?.[0] ?? null;
  const fotos = cancha.fotos ?? [];
  const servicios = cancha.servicios ?? [];
  const modalidades = ordenarModalidades(cancha.modalidades);
  const franjas = (cancha.franjas ?? []).filter(
    (f) => f.dia_semana != null && f.hora_inicio && f.hora_fin
  );
  const resumen = resumirHorario(franjas);

  // Reseñas verificadas y señales de confianza (migración 017; si no existe, se omiten)
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
    <main className="mx-auto flex min-h-screen max-w-xl flex-col pb-36">
      {/* Foto */}
      <div className="relative">
        {fotos.length > 0 ? (
          <div className="sin-scroll flex snap-x snap-mandatory overflow-x-auto">
            {fotos.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src}
                src={src}
                alt={`Foto ${i + 1} de ${cancha.nombre}`}
                className="h-56 w-full shrink-0 snap-center object-cover"
              />
            ))}
          </div>
        ) : (
          <div className="fondo-cancha flex h-48 items-center justify-center">
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="white" strokeOpacity="0.6" strokeWidth="1.5" aria-hidden="true">
              <rect x="2" y="5" width="20" height="14" rx="1" />
              <path d="M12 5v14" />
              <circle cx="12" cy="12" r="2.5" />
              <path d="M2 9.5h2.5v5H2M22 9.5h-2.5v5H22" />
            </svg>
          </div>
        )}
        <Link
          href="/"
          aria-label="Volver a todas las canchas"
          className="absolute left-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#1B1B1B] shadow"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <span className="absolute right-4 top-4 rounded-full bg-black/25 px-3 py-1.5 backdrop-blur">
          <Logo claro />
        </span>
      </div>

      <div className="relative -mt-6 flex flex-col gap-6 rounded-t-3xl bg-white p-5 shadow-[0_-4px_16px_rgb(0_0_0/0.06)]">
        {/* Datos principales */}
        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded-full bg-[#EDE9FE] px-2.5 py-1 text-[#6D28D9]">
              {DEPORTES[cancha.deporte] ?? cancha.deporte}
            </span>
            {cancha.superficie && (
              <span className="rounded-full bg-[#F4F4F4] px-2.5 py-1 text-[#4A4A4A]">
                {cancha.superficie}
              </span>
            )}
          </div>

          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-bold leading-tight text-[#1B1B1B]">{cancha.nombre}</h1>
            {desde !== null && (
              <p className="shrink-0 text-right">
                <span className="block text-xs text-[#5A5A5A]">Desde</span>
                <span className="text-lg font-bold text-[#1B1B1B]">{soles(desde)}</span>
                <span className="text-xs text-[#5A5A5A]">/h</span>
              </p>
            )}
          </div>

          <p className="flex items-start gap-1.5 text-sm text-[#5A5A5A]">
            <svg className="mt-0.5 shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            {cancha.direccion}, {cancha.distrito}
          </p>

          {/* Señales de confianza */}
          {confianza && <ConfianzaCancha c={confianza} />}

          {/* Dueño, visible desde el primer vistazo */}
          {contacto?.nombre && (
            <p className="flex items-center gap-1.5 text-sm text-[#5A5A5A]">
              <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
              </svg>
              Dueño: <strong className="font-bold text-[#1B1B1B]">{contacto.nombre}</strong>
              {contacto.celular && (
                <span className="rounded-full bg-[#DCF5EA] px-1.5 py-0.5 text-[10px] font-bold text-[#0F7A55]">✓ WhatsApp</span>
              )}
            </p>
          )}

          {cancha.descripcion && (
            <p className="text-sm leading-relaxed text-[#1B1B1B]">{cancha.descripcion}</p>
          )}

          {servicios.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#4A4A4A]">
              {servicios.map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6D28D9" strokeWidth="2.5" aria-hidden="true">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                  {s}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Modalidades de fútbol (opcional) */}
        {modalidades.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-bold text-[#1B1B1B]">Se puede jugar</h2>
            <ul className="grid grid-cols-3 gap-2">
              {modalidades.map((n) => (
                <li
                  key={n}
                  className="flex flex-col items-center rounded-2xl border border-[#6D28D9]/25 bg-[#EDE9FE] px-2 py-3 text-center"
                >
                  <span className="text-xs font-medium text-[#6D28D9]">Fútbol</span>
                  <span className="text-2xl font-extrabold leading-none text-[#6D28D9]">{n}</span>
                  <span className="mt-1 text-[11px] text-[#4A5A52]">
                    {n} vs {n} · {n * 2} jugadores
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Horario de atención, resumido */}
        {resumen.length > 0 && (
          <section className="rounded-2xl bg-[#F7F8F7] p-4">
            <h2 className="mb-2 text-sm font-bold text-[#1B1B1B]">Horario de atención</h2>
            <ul className="flex flex-col gap-1.5 text-sm">
              {resumen.map((r) => (
                <li key={`${r.dias}-${r.horas}`} className="flex justify-between gap-3">
                  <span className="text-[#1B1B1B]">
                    <span className="font-medium">{r.dias}</span>
                    <span className="text-[#5A5A5A]"> · {r.horas}</span>
                  </span>
                  <span className="shrink-0 text-[#1B1B1B]">{soles(r.precio)}/h</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Política de cancelación: el jugador la ve antes de reservar */}
        {franjas.length > 0 && <PoliticaCancha politica={cancha.politica_cancelacion} />}

        {/* Reserva */}
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
          <p className="rounded-2xl bg-[#EDE9FE] p-4 text-sm text-[#4A5A52]">
            Esta cancha todavía no publicó sus horarios para reservar.
          </p>
        )}

        <Ubicacion
          nombre={cancha.nombre}
          direccion={cancha.direccion}
          distrito={cancha.distrito}
          latitud={cancha.latitud}
          longitud={cancha.longitud}
        />

        {contacto && <ContactoDueno nombre={contacto.nombre} celular={contacto.celular} cancha={cancha.nombre} />}

        {hayResenas && <ResenasCancha resenas={resenas} />}
      </div>
    </main>
  );
}
