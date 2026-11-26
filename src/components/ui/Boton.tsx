import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

export type VarianteBoton = "principal" | "secundario" | "suave" | "fantasma" | "peligro" | "exito";
export type TamanoBoton = "sm" | "md" | "lg";

const VARIANTES: Record<VarianteBoton, string> = {
  principal: "boton-morado text-white shadow-sm hover:brightness-110",
  secundario: "border border-marca bg-superficie text-marca hover:bg-marca-tinte",
  suave: "bg-marca-tinte text-marca hover:bg-marca-claro/50",
  fantasma: "text-tinta-suave hover:bg-superficie-suave",
  peligro: "border border-red-200 bg-superficie text-red-700 hover:bg-red-50",
  exito: "bg-exito text-white shadow-sm hover:brightness-110",
};

const TAMANOS: Record<TamanoBoton, string> = {
  sm: "gap-1.5 rounded-lg px-3 py-1.5 text-xs",
  md: "gap-2 rounded-xl px-4 py-2.5 text-sm",
  lg: "gap-2 rounded-xl px-5 py-3 text-base",
};

type Comun = {
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
  /** Ocupa todo el ancho disponible */
  ancho?: boolean;
  /** Muestra un indicador y bloquea el botón */
  cargando?: boolean;
  icono?: ReactNode;
  className?: string;
  children: ReactNode;
};

type ComoBoton = Comun & Omit<ComponentProps<"button">, keyof Comun>;
type ComoEnlace = Comun & { href: string; target?: string; rel?: string; "aria-label"?: string };

function Indicador() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Botón de EasyFut. Con `href` se comporta como enlace.
 *   <Boton onClick={…}>Guardar</Boton>
 *   <Boton variante="secundario" href="/panel">Mi panel</Boton>
 */
export function Boton(props: ComoBoton | ComoEnlace) {
  const { variante = "principal", tamano = "md", ancho, cargando, icono, className, children } = props;
  const clases = cx(
    "inline-flex select-none items-center justify-center font-bold transition active:scale-[0.98]",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca",
    "disabled:pointer-events-none disabled:opacity-50",
    VARIANTES[variante],
    TAMANOS[tamano],
    ancho && "w-full",
    className
  );
  const contenido = (
    <>
      {cargando ? <Indicador /> : icono}
      {children}
    </>
  );

  if ("href" in props && props.href !== undefined) {
    const { href, target, rel } = props;
    return (
      <Link href={href} target={target} rel={rel} aria-label={props["aria-label"]} className={clases}>
        {contenido}
      </Link>
    );
  }

  const {
    variante: _v,
    tamano: _t,
    ancho: _a,
    cargando: _c,
    icono: _i,
    className: _cl,
    children: _ch,
    disabled,
    type = "button",
    ...resto
  } = props as ComoBoton;
  void _v, void _t, void _a, void _c, void _i, void _cl, void _ch;
  return (
    <button type={type} disabled={disabled || cargando} aria-busy={cargando || undefined} className={clases} {...resto}>
      {contenido}
    </button>
  );
}
