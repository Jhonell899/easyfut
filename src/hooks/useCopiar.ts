"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Copia texto al portapapeles y recuerda qué se copió por 2 segundos.
 *   const { copiado, copiar } = useCopiar();
 *   <button onClick={() => copiar(numero, "yape")}>{copiado === "yape" ? "¡Copiado!" : "Copiar"}</button>
 */
export function useCopiar(duracionMs = 2000) {
  const [copiado, setCopiado] = useState<string | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  const copiar = useCallback(
    async (texto: string, clave = "texto") => {
      try {
        await navigator.clipboard.writeText(texto);
        setCopiado(clave);
        clearTimeout(temporizador.current);
        temporizador.current = setTimeout(() => setCopiado(null), duracionMs);
        return true;
      } catch {
        return false;
      }
    },
    [duracionMs]
  );

  return { copiado, copiar };
}
