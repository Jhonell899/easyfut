import Link from "next/link";
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
  latitud?: number | null;
  longitud?: number | null;
  franjas: { precio_hora: number }[];
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

export default function TarjetaCancha({ cancha, km }: { cancha: Cancha; km?: number | null }) {
  const cerca = km != null ? cercania(km) : null;
  const precios = (cancha.franjas ?? []).map((f) => Number(f.precio_hora));
  const desde = precios.length ? Math.min(...precios) : null;

  return (
    <Link
      href={`/c/${cancha.slug}`}
      className="group block overflow-hidden rounded-2xl border border-[#E3E3E3] bg-white transition-shadow hover:shadow-md"
    >
      <div className="relative">
        {cancha.fotos?.[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cancha.fotos[0]}
            alt={`Foto de ${cancha.nombre}`}
            className="h-36 w-full object-cover"
          />
        ) : (
          <div className="fondo-cancha flex h-36 items-center justify-center">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="white" strokeOpacity="0.6" strokeWidth="1.5" aria-hidden="true">
              <rect x="2" y="5" width="20" height="14" rx="1" />
              <path d="M12 5v14" />
              <circle cx="12" cy="12" r="2.5" />
              <path d="M2 9.5h2.5v5H2M22 9.5h-2.5v5H22" />
            </svg>
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-xs font-medium text-[#0B6E4F]">
          {etiquetaDeporte(cancha.deporte, cancha.modalidades)}
        </span>
        {cerca && (
          <span className={`absolute right-3 top-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold shadow-sm ${cerca.clase}`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2a7 7 0 0 0-7 7c0 5.3 7 13 7 13s7-7.7 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
            </svg>
            {fmtDistancia(km!)} · {cerca.texto}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1 p-4">
        <h2 className="text-base font-bold text-[#1B1B1B]">{cancha.nombre}</h2>
        <p className="flex items-start gap-1.5 text-sm text-[#5A5A5A]">
          <svg className="mt-0.5 shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          {cancha.direccion}, {cancha.distrito}
        </p>

        <div className="mt-2 flex items-center justify-between">
          {desde !== null ? (
            <p className="whitespace-nowrap text-sm text-[#5A5A5A]">
              Desde <span className="text-lg font-bold text-[#1B1B1B]">S/ {desde.toFixed(2)}</span> /h
            </p>
          ) : (
            <p className="text-sm text-[#5A5A5A]">Sin precios aún</p>
          )}
          <span className="rounded-xl bg-[#0B6E4F] px-4 py-2 text-sm font-bold text-white">
            Reservar
          </span>
        </div>
      </div>
    </Link>
  );
}
