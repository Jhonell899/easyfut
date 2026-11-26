import type { ReactNode } from "react";
import { cx } from "./cx";

/** Bloque gris que late mientras carga: <Esqueleto alto="h-40" /> */
export function Esqueleto({ alto = "h-24", className }: { alto?: string; className?: string }) {
  return <div aria-hidden="true" className={cx("animate-pulse rounded-2xl bg-superficie", alto, className)} />;
}

/** Varias filas de esqueleto, para listas. */
export function EsqueletoLista({ filas = 3 }: { filas?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-label="Cargando" role="status">
      {Array.from({ length: filas }, (_, i) => (
        <Esqueleto key={i} alto="h-16" />
      ))}
    </div>
  );
}

/**
 * Lista vacía con un mensaje amable y una acción opcional.
 *   <Vacio icono="📅" titulo="Aún no tienes reservas" accion={<Boton href="/">Buscar canchas</Boton>} />
 */
export function Vacio({
  icono,
  titulo,
  texto,
  accion,
}: {
  icono?: string;
  titulo: ReactNode;
  texto?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-superficie px-5 py-8 text-center shadow-sm">
      {icono && (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-marca-tinte text-2xl" aria-hidden="true">
          {icono}
        </span>
      )}
      <p className="font-bold text-tinta">{titulo}</p>
      {texto && <p className="max-w-xs text-sm text-tinta-suave">{texto}</p>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  );
}
