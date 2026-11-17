import Estrellas from "@/components/Estrellas";
import ReportarResena from "@/components/ReportarResena";
import { fmtFecha } from "@/lib/horario";

export type ResenaPublica = {
  id: string;
  estrellas: number;
  comentario: string | null;
  nombre: string | null;
  respuesta: string | null;
  created_at: string;
};

/** Resumen y lista de reseñas verificadas de una cancha. */
export default function ResenasCancha({ resenas }: { resenas: ResenaPublica[] }) {
  if (resenas.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold text-[#1B1B1B]">Reseñas</h2>
        <p className="rounded-2xl bg-[#F7F8F7] p-4 text-sm text-[#5A5A5A]">
          Todavía no hay reseñas. Solo pueden opinar quienes jugaron aquí con una reserva pagada.
        </p>
      </section>
    );
  }

  const promedio = resenas.reduce((s, r) => s + r.estrellas, 0) / resenas.length;
  const conteo = [5, 4, 3, 2, 1].map((n) => ({ n, total: resenas.filter((r) => r.estrellas === n).length }));

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-bold text-[#1B1B1B]">Reseñas</h2>

      <div className="flex items-center gap-4 rounded-2xl bg-[#F7F8F7] p-4">
        <div className="flex flex-col items-center">
          <span className="text-4xl font-extrabold text-[#14231D]">{promedio.toFixed(1)}</span>
          <Estrellas valor={promedio} tam={14} />
          <span className="mt-1 text-xs text-[#5A5A5A]">
            {resenas.length} reseña{resenas.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          {conteo.map((c) => (
            <div key={c.n} className="flex items-center gap-2 text-xs text-[#5A5A5A]">
              <span className="w-3 text-right">{c.n}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#E5E7EB]">
                <div className="h-full rounded-full bg-amber-400" style={{ width: `${(c.total / resenas.length) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {resenas.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 rounded-2xl border border-[#E3E3E3] bg-white p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EDE9FE] font-bold text-[#6D28D9]">
                  {(r.nombre || "J").charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="font-bold leading-tight">{r.nombre || "Jugador"}</p>
                  <p className="text-[11px] font-bold text-[#0F7A55]">✓ Jugó aquí</p>
                </div>
              </div>
              <span className="text-xs text-[#8A968F]">
                {fmtFecha(r.created_at, { day: "numeric", month: "short", year: "numeric" })}
              </span>
            </div>
            <Estrellas valor={r.estrellas} />
            {r.comentario && <p className="leading-relaxed text-[#1B1B1B]">{r.comentario}</p>}
            {r.respuesta && (
              <p className="rounded-xl bg-[#F5F3FF] p-3 text-[#4C1D95]">
                <strong>Respuesta del dueño:</strong> {r.respuesta}
              </p>
            )}
            <div className="flex justify-end">
              <ReportarResena id={r.id} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
