import { Insignia, Vacio, type TonoInsignia } from "@/components/ui";
import { fmtFecha, soles } from "@/lib/horario";
import type { Movimiento, Recarga } from "./tipos";

const fecha = (iso: string) =>
  fmtFecha(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

const ESTADO: Record<string, { texto: string; tono: TonoInsignia }> = {
  pendiente: { texto: "En revisión", tono: "aviso" },
  aprobada: { texto: "Aprobada", tono: "exito" },
  rechazada: { texto: "Rechazada", tono: "peligro" },
};

function Lista({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-borde overflow-hidden rounded-2xl bg-superficie shadow-sm">{children}</ul>;
}

/** Recargas que avisó el dueño y su estado. */
export function ListaRecargas({ recargas }: { recargas: Recarga[] }) {
  if (recargas.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-bold">Tus recargas</h2>
      <Lista>
        {recargas.map((r) => {
          const e =
            r.verificacion === "por_verificar"
              ? { texto: "Sumada · por verificar", tono: "marca" as const }
              : r.verificacion === "fallida"
                ? { texto: "Anulada", tono: "peligro" as const }
                : (ESTADO[r.estado] ?? { texto: r.estado, tono: "neutro" as const });
          return (
            <li key={r.id} className="flex items-center justify-between gap-3 p-4 text-sm">
              <span className="min-w-0">
                <span className="block font-bold">{soles(Number(r.monto))}</span>
                <span className="block truncate text-xs text-tinta-suave">
                  {r.medio === "bcp" ? "BCP" : "Yape"} · operación {r.operacion} · {fecha(r.created_at)}
                </span>
                {r.nota && <span className="block text-xs text-tinta-suave">{r.nota}</span>}
              </span>
              <Insignia tono={e.tono}>{e.texto}</Insignia>
            </li>
          );
        })}
      </Lista>
    </section>
  );
}

/** Cada suma o resta al saldo. */
export function ListaMovimientos({ movimientos }: { movimientos: Movimiento[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-bold">Movimientos</h2>
      {movimientos.length === 0 ? (
        <Vacio icono="🧾" titulo="Aún no hay movimientos" texto="Aquí verás tus recargas y lo que se descuenta por cada reserva." />
      ) : (
        <Lista>
          {movimientos.map((m) => {
            const suma = Number(m.monto) > 0;
            return (
              <li key={m.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{m.detalle ?? m.tipo}</span>
                  <span className="block text-xs text-tinta-suave">{fecha(m.created_at)}</span>
                </span>
                <span className={suma ? "shrink-0 font-bold text-exito" : "shrink-0 font-bold text-tinta"}>
                  {suma ? "+" : "−"}
                  {soles(Math.abs(Number(m.monto)))}
                </span>
              </li>
            );
          })}
        </Lista>
      )}
    </section>
  );
}
