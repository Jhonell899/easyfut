import type { ReactNode } from "react";
import { cx } from "./cx";

export type TonoTarjeta = "normal" | "marca" | "exito" | "aviso" | "peligro" | "suave";

const TONOS: Record<TonoTarjeta, string> = {
  normal: "bg-superficie shadow-sm",
  marca: "bg-marca-tinte text-marca-texto",
  exito: "bg-exito-tinte text-exito",
  aviso: "border border-amber-200 bg-amber-50 text-amber-900",
  peligro: "border border-red-200 bg-red-50 text-red-800",
  suave: "bg-superficie-suave",
};

/**
 * Caja blanca redondeada, con título, descripción y una acción opcional a la derecha.
 *   <Tarjeta titulo="Recargar saldo" descripcion="Desde S/ 1">…</Tarjeta>
 */
export function Tarjeta({
  titulo,
  descripcion,
  accion,
  tono = "normal",
  como: Etiqueta = "section",
  className,
  children,
}: {
  titulo?: ReactNode;
  descripcion?: ReactNode;
  accion?: ReactNode;
  tono?: TonoTarjeta;
  como?: "section" | "div" | "article";
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Etiqueta className={cx("flex flex-col gap-3 rounded-2xl p-4 sm:p-5", TONOS[tono], className)}>
      {(titulo || accion) && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {titulo && <h2 className="text-base font-bold leading-tight">{titulo}</h2>}
            {descripcion && <p className="mt-0.5 text-xs opacity-80">{descripcion}</p>}
          </div>
          {accion && <div className="shrink-0">{accion}</div>}
        </div>
      )}
      {children}
    </Etiqueta>
  );
}
