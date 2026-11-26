import type { ReactNode } from "react";
import { cx } from "./cx";

export type TonoAviso = "info" | "exito" | "aviso" | "error";

const TONOS: Record<TonoAviso, { clase: string; icono: string }> = {
  info: { clase: "bg-marca-tinte text-marca-texto", icono: "ℹ" },
  exito: { clase: "bg-exito-tinte text-exito", icono: "✓" },
  aviso: { clase: "border border-amber-200 bg-amber-50 text-amber-900", icono: "!" },
  error: { clase: "bg-red-50 text-red-700", icono: "✕" },
};

/**
 * Mensaje para el usuario. Los de error se anuncian al lector de pantalla.
 *   <Aviso tono="error">No se pudo guardar.</Aviso>
 */
export function Aviso({
  tono = "info",
  titulo,
  className,
  children,
}: {
  tono?: TonoAviso;
  titulo?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const t = TONOS[tono];
  return (
    <div
      role={tono === "error" ? "alert" : "status"}
      className={cx("flex animate-aparecer gap-2.5 rounded-xl p-3 text-sm", t.clase, className)}
    >
      <span
        aria-hidden="true"
        className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-current/10 text-xs font-extrabold"
      >
        {t.icono}
      </span>
      <div className="min-w-0">
        {titulo && <p className="font-bold">{titulo}</p>}
        {children}
      </div>
    </div>
  );
}
