"use client";

import { Boton, cx } from "@/components/ui";
import { useCopiar } from "@/hooks/useCopiar";

/** Un dato (número de Yape, cuenta, CCI) con su botón para copiarlo. */
export function DatoCopiable({
  etiqueta,
  mostrar,
  copiar: valor,
  grande,
}: {
  etiqueta?: string;
  mostrar: string;
  copiar: string;
  grande?: boolean;
}) {
  const { copiado, copiar } = useCopiar();
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        {etiqueta && <p className="text-xs text-marca-texto">{etiqueta}</p>}
        <p className={cx("truncate font-extrabold tracking-wide text-marca-texto", grande ? "text-2xl" : "text-lg")}>
          {mostrar}
        </p>
      </div>
      <Boton variante="secundario" tamano="sm" className="shrink-0" onClick={() => copiar(valor)}>
        {copiado ? "¡Copiado!" : "Copiar"}
      </Boton>
    </div>
  );
}
