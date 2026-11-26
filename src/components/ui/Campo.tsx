"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { cx } from "./cx";

const BASE =
  "w-full rounded-xl border bg-superficie px-3 py-3 text-base text-tinta outline-none transition " +
  "placeholder:text-tinta-tenue focus:ring-2 disabled:bg-superficie-suave disabled:text-tinta-suave";

function estilos(error?: ReactNode) {
  return error
    ? "border-red-300 focus:border-red-500 focus:ring-red-200"
    : "border-borde focus:border-marca focus:ring-marca/20";
}

type Envoltura = { etiqueta: ReactNode; ayuda?: ReactNode; error?: ReactNode; className?: string };

function Marco({
  id,
  etiqueta,
  ayuda,
  error,
  className,
  children,
}: Envoltura & { id: string; children: ReactNode }) {
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-sm font-bold text-tinta">
        {etiqueta}
      </label>
      {children}
      {error ? (
        <p id={`${id}-nota`} className="text-xs text-red-700">
          {error}
        </p>
      ) : ayuda ? (
        <p id={`${id}-nota`} className="text-xs text-tinta-suave">
          {ayuda}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Campo de texto con etiqueta, ayuda y error accesibles.
 *   <Campo etiqueta="Celular" ayuda="9 dígitos" value={…} onChange={…} />
 */
export function Campo({ etiqueta, ayuda, error, className, id, ...input }: Envoltura & ComponentProps<"input">) {
  const generado = useId();
  const idCampo = id ?? generado;
  return (
    <Marco id={idCampo} etiqueta={etiqueta} ayuda={ayuda} error={error} className={className}>
      <input
        id={idCampo}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || ayuda ? `${idCampo}-nota` : undefined}
        className={cx(BASE, estilos(error))}
        {...input}
      />
    </Marco>
  );
}

/** Igual que Campo, pero para textos largos. */
export function CampoTexto({ etiqueta, ayuda, error, className, id, ...area }: Envoltura & ComponentProps<"textarea">) {
  const generado = useId();
  const idCampo = id ?? generado;
  return (
    <Marco id={idCampo} etiqueta={etiqueta} ayuda={ayuda} error={error} className={className}>
      <textarea
        id={idCampo}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || ayuda ? `${idCampo}-nota` : undefined}
        className={cx(BASE, "min-h-24 resize-y", estilos(error))}
        {...area}
      />
    </Marco>
  );
}
