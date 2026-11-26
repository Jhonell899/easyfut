import type { ReactNode } from "react";
import { cx } from "./cx";

export type TonoInsignia = "marca" | "exito" | "aviso" | "peligro" | "neutro" | "banco" | "solido";

const TONOS: Record<TonoInsignia, string> = {
  marca: "bg-marca-tinte text-marca",
  exito: "bg-exito-tinte text-exito",
  aviso: "bg-amber-50 text-amber-800",
  peligro: "bg-red-50 text-red-700",
  neutro: "bg-superficie-suave text-tinta-suave",
  banco: "bg-[#e0ecff] text-[#003a8c]",
  solido: "bg-marca text-white",
};

/** Etiqueta pequeña de estado: <Insignia tono="exito">Confirmada</Insignia> */
export function Insignia({ tono = "neutro", className, children }: { tono?: TonoInsignia; className?: string; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold",
        TONOS[tono],
        className
      )}
    >
      {children}
    </span>
  );
}
