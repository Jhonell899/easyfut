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
      className="sombra-suave group block overflow-hidden rounded-3xl bg-white transition-all duration-200 hover:-translate-y-1"
    >
      {/* Foto con el nombre encima */}
      <div className="relative h-48 overflow-hidden bg-[#0A3D2E]">
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
            <svg width="120" height="80" viewBox="0 0 60 40" fill="none" stroke="white" strokeOpacity="0.28" strokeWidth="1" aria-hidden="true">
              <rect x="2" y="2" width="56" height="36" rx="2" />
              <path d="M30 2v36" />
              <circle cx="30" cy="20" r="6" />
              <path d="M2 12h8v16H2M58 12h-8v16h8" />
            </svg>
          </div>
        )}
        {/* Degradado para que el texto se lea sobre cualquier foto */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#062A1F]/90 via-[#062A1F]/20 to-transparent" />

        <span className="absolute left-3 top-3 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white ring-1 ring-white/30 backdrop-blur-md">
          {etiquetaDeporte(cancha.deporte, cancha.modalidades)}
        </span>
        {cerca && (
          <span className={`absolute right-3 top-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold shadow-md ${cerca.clase}`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2a7 7 0 0 0-7 7c0 5.3 7 13 7 13s7-7.7 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
            </svg>
            {fmtDistancia(km!)} · {cerca.texto}
          </span>
        )}

        <div className="absolute inset-x-4 bottom-3 text-white">
          <h2 className="truncate text-xl font-extrabold leading-tight drop-shadow">{cancha.nombre}</h2>
          <p className="flex items-center gap-1 text-sm text-white/85">
            <svg className="shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2a7 7 0 0 0-7 7c0 5.3 7 13 7 13s7-7.7 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
            </svg>
            <span className="truncate">
              {cancha.distrito} · {cancha.direccion}
            </span>
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-4">
        {/* Confianza y disponibilidad */}
        {(libre || confianza) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {libre && (
              <span className="rounded-full bg-[#DCF5EA] px-2.5 py-1 font-bold text-[#0F7A55]">✓ Libre a las {libre}</span>
            )}
            {confianza && confianza.total_resenas > 0 && confianza.promedio != null ? (
              <span className="flex items-center gap-1 font-bold text-[#14231D]">
                <span className="text-amber-500" aria-hidden="true">★</span>
                {Number(confianza.promedio).toFixed(1)}
                <span className="font-normal text-[#8A968F]">({confianza.total_resenas})</span>
              </span>
            ) : (
              confianza && <span className="text-[#8A968F]">Sin reseñas aún</span>
            )}
            {confianza && confianza.partidos > 0 && (
              <span className="text-[#5A5A5A]">
                {confianza.partidos} partido{confianza.partidos === 1 ? "" : "s"} jugado{confianza.partidos === 1 ? "" : "s"}
              </span>
            )}
            {confianza?.dueno_verificado && <span className="font-bold text-[#0F7A55]">✓ Dueño verificado</span>}
          </div>
        )}

        {detalles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {detalles.map((d) => (
              <span key={d} className="rounded-full bg-[#F3F1FA] px-2.5 py-1 text-xs font-medium text-[#4C1D95]">
                {d}
              </span>
            ))}
            {extra > 0 && <span className="rounded-full bg-[#F3F1FA] px-2.5 py-1 text-xs font-medium text-[#8A968F]">+{extra}</span>}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          {desde !== null ? (
            <p className="leading-tight">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-[#8A968F]">Desde</span>
              <span className="whitespace-nowrap text-2xl font-extrabold text-[#0A3D2E]">
                S/ {Number.isInteger(desde) ? desde : desde.toFixed(2)}
                <span className="text-sm font-medium text-[#8A968F]"> /hora</span>
              </span>
            </p>
          ) : (
            <p className="text-sm text-[#5A5A5A]">Sin precios aún</p>
          )}
          <span className="boton-morado flex items-center gap-1.5 rounded-2xl px-5 py-3 text-sm font-bold text-white transition-transform group-hover:scale-105">
            Reservar
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}
