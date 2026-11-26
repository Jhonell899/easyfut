import Link from "next/link";
import Image from "next/image";
import { cercania, fmtDistancia } from "@/lib/ubicacion";

export type Cancha = {
  id: string;
  nombre: string;
  slug: string;
  deporte: string;
  direccion: string;
  distrito: string;
  fotos: string[] | null;
  modalidades?: number[] | null;
  superficie?: string | null;
  servicios?: string[] | null;
  latitud?: number | null;
  longitud?: number | null;
  franjas: { precio_hora: number }[];
};

/** Datos públicos de confianza de una cancha (migración 017). */
export type Confianza = {
  promedio: number | null;
  total_resenas: number;
  partidos: number;
  dueno_verificado: boolean;
};

export const DEPORTES: Record<string, string> = {
  futbol: "Fútbol",
  futsal: "Futsal",
  voley: "Vóley",
  basquet: "Básquet",
  otro: "Otro",
};

/** Modalidades ordenadas: [11, 7] → [7, 11]. */
export function ordenarModalidades(m?: number[] | null): number[] {
  return [...new Set(m ?? [])].sort((a, b) => a - b);
}

/** "Fútbol 7 · 9 · 11", o el nombre del deporte si no hay modalidades. */
export function etiquetaDeporte(deporte: string, modalidades?: number[] | null): string {
  const base = DEPORTES[deporte] ?? deporte;
  const m = ordenarModalidades(modalidades);
  return m.length ? `${base} ${m.join(" · ")}` : base;
}

export default function TarjetaCancha({
  cancha,
  km,
  confianza,
  libre,
}: {
  cancha: Cancha;
  km?: number | null;
  confianza?: Confianza;
  /** Hora del primer turno libre, si se buscó "¿Cuándo quieres jugar?". */
  libre?: string;
}) {
  const cerca = km != null ? cercania(km) : null;
  const precios = (cancha.franjas ?? []).map((f) => Number(f.precio_hora));
  const desde = precios.length ? Math.min(...precios) : null;
  const servicios = cancha.servicios ?? [];
  const detalles = [cancha.superficie, ...servicios.slice(0, 2)].filter(Boolean) as string[];
  const extra = servicios.length - 2;

  return (
    <Link
      href={`/c/${cancha.slug}`}
      className="sombra-suave group flex flex-col overflow-hidden rounded-3xl bg-white border border-slate-100 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:border-violet-200"
    >
      {/* Foto con el nombre encima */}
      <div className="relative h-48 sm:h-52 w-full overflow-hidden bg-[#0A2E1F]">
        {cancha.fotos?.[0] ? (
          <Image
            src={cancha.fotos[0]}
            alt={`Foto de ${cancha.nombre}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="fondo-cancha flex h-full items-center justify-center">
            <svg width="120" height="80" viewBox="0 0 60 40" fill="none" stroke="white" strokeOpacity="0.25" strokeWidth="1" aria-hidden="true">
              <rect x="2" y="2" width="56" height="36" rx="2" />
              <path d="M30 2v36" />
              <circle cx="30" cy="20" r="6" />
              <path d="M2 12h8v16H2M58 12h-8v16h8" />
            </svg>
          </div>
        )}
        {/* Degradado para lectura óptima */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#051D14]/95 via-[#051D14]/25 to-transparent" />

        <span className="absolute left-3.5 top-3.5 rounded-full bg-slate-900/60 px-3 py-1 text-xs font-bold text-violet-400 ring-1 ring-violet-400/30 backdrop-blur-md">
          {etiquetaDeporte(cancha.deporte, cancha.modalidades)}
        </span>
        {cerca && (
          <span className={`absolute right-3.5 top-3.5 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold shadow-md ${cerca.clase}`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2a7 7 0 0 0-7 7c0 5.3 7 13 7 13s7-7.7 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
            </svg>
            {fmtDistancia(km!)} · {cerca.texto}
          </span>
        )}

        <div className="absolute inset-x-4 bottom-3 text-white">
          <h2 className="truncate text-xl font-extrabold leading-tight tracking-tight drop-shadow">{cancha.nombre}</h2>
          <p className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-200 mt-0.5">
            <svg className="shrink-0 text-violet-400" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2a7 7 0 0 0-7 7c0 5.3 7 13 7 13s7-7.7 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
            </svg>
            <span className="truncate">
              {cancha.distrito} · {cancha.direccion}
            </span>
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between gap-3 p-4 sm:p-5">
        {/* Confianza y disponibilidad */}
        <div className="flex flex-col gap-2">
          {(libre || confianza) && (
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
              {libre && (
                <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 font-bold text-emerald-700">
                  ✓ Libre a las {libre}
                </span>
              )}
              {confianza && confianza.total_resenas > 0 && confianza.promedio != null ? (
                <span className="flex items-center gap-1 font-bold text-slate-800">
                  <span className="text-amber-500" aria-hidden="true">★</span>
                  {Number(confianza.promedio).toFixed(1)}
                  <span className="font-normal text-slate-400">({confianza.total_resenas})</span>
                </span>
              ) : (
                confianza && <span className="text-slate-400 text-[11px]">Sin reseñas aún</span>
              )}
              {confianza && confianza.partidos > 0 && (
                <span className="text-slate-500 text-[11px]">
                  {confianza.partidos} partido{confianza.partidos === 1 ? "" : "s"}
                </span>
              )}
              {confianza?.dueno_verificado && <span className="font-bold text-emerald-600 text-[11px]">✓ Dueño verificado</span>}
            </div>
          )}

          {detalles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {detalles.map((d) => (
                <span key={d} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  {d}
                </span>
              ))}
              {extra > 0 && <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-400">+{extra}</span>}
            </div>
          )}
        </div>

        {/* Precio y Botón de reserva */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3.5 mt-1">
          {desde !== null ? (
            <div className="leading-tight">
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">Desde</span>
              <div className="whitespace-nowrap text-xl sm:text-2xl font-black text-slate-900">
                S/ {Number.isInteger(desde) ? desde : desde.toFixed(2)}
                <span className="text-xs font-medium text-slate-500"> /hora</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Sin precios configurados</p>
          )}

          <span className="boton-verde flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold text-white transition-all group-hover:shadow-md active:scale-95">
            Reservar
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}
