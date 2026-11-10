import DistanciaCancha from "@/components/DistanciaCancha";

type Props = {
  nombre: string;
  direccion: string;
  distrito: string;
  latitud?: number | null;
  longitud?: number | null;
};

export default function Ubicacion({ nombre, direccion, distrito, latitud, longitud }: Props) {
  const lat = latitud != null ? Number(latitud) : null;
  const lng = longitud != null ? Number(longitud) : null;
  const tieneCoords = lat !== null && lng !== null;

  const comoLlegar = tieneCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${direccion}, ${distrito}, Lima, Perú`
      )}`;

  const d = 0.004; // margen del mapa alrededor del punto
  const mapa = tieneCoords
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${lng! - d},${lat! - d},${lng! + d},${lat! + d}&layer=mapnik&marker=${lat},${lng}`
    : null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-bold text-[#1B1B1B]">Ubicación</h2>
      <div className="overflow-hidden rounded-2xl border border-[#E3E3E3] bg-white">
        {mapa && (
          <iframe
            title={`Mapa de ${nombre}`}
            src={mapa}
            loading="lazy"
            className="pointer-events-none h-44 w-full border-0"
          />
        )}
        <div className="flex items-center justify-between gap-3 p-4">
          <p className="text-sm text-[#1B1B1B]">
            {direccion}
            <span className="block text-[#5A5A5A]">{distrito}, Lima</span>
          </p>
          <a
            href={comoLlegar}
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-[#6D28D9] px-3 py-2 text-sm font-bold text-[#6D28D9]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M3 11l18-8-8 18-2-8-8-2z" />
            </svg>
            Cómo llegar
          </a>
        </div>
        {tieneCoords && <DistanciaCancha lat={lat!} lng={lng!} />}
      </div>
    </section>
  );
}
