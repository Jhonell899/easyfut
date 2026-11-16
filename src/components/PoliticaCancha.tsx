import { POLITICAS, REGLAS_COMUNES, describirTramos, politicaDe } from "@/lib/politicas";

/** Política de cancelación de la cancha, visible antes de reservar. */
export default function PoliticaCancha({ politica }: { politica: unknown }) {
  const clave = politicaDe(politica);
  const p = POLITICAS[clave];
  return (
    <section className="rounded-2xl bg-[#F7F8F7] p-4" id="politica">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-[#1B1B1B]">Política de cancelación</h2>
        <span className="rounded-full bg-[#EDE9FE] px-2.5 py-0.5 text-xs font-bold text-[#6D28D9]">{p.nombre}</span>
      </div>
      <ul className="flex flex-col gap-1 text-sm text-[#1B1B1B]">
        {describirTramos(clave).map((t) => (
          <li key={t}>• {t}</li>
        ))}
      </ul>
      <details className="mt-2 text-xs text-[#5A5A5A]">
        <summary className="cursor-pointer font-medium text-[#6D28D9]">Lo que siempre se cumple</summary>
        <ul className="mt-1.5 flex flex-col gap-1">
          {REGLAS_COMUNES.map((r) => (
            <li key={r}>• {r}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
