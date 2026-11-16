// Políticas de cancelación. El dueño elige UNA de estas opciones fijas:
// así ninguna cancha puede imponer reglas abusivas, y el jugador sabe
// exactamente qué le corresponde antes de reservar.

export type Politica = "flexible" | "moderada" | "estricta";

type Tramo = { desdeHoras: number; porcentaje: number };

export type DefinicionPolitica = {
  nombre: string;
  resumen: string;
  /** De mayor a menor anticipación. El primer tramo que se cumpla define la devolución. */
  tramos: Tramo[];
};

export const POLITICAS: Record<Politica, DefinicionPolitica> = {
  flexible: {
    nombre: "Flexible",
    resumen: "Devolución completa hasta 12 horas antes.",
    tramos: [
      { desdeHoras: 12, porcentaje: 100 },
      { desdeHoras: 0, porcentaje: 50 },
    ],
  },
  moderada: {
    nombre: "Moderada",
    resumen: "Devolución completa hasta 24 horas antes; la mitad hasta 6 horas antes.",
    tramos: [
      { desdeHoras: 24, porcentaje: 100 },
      { desdeHoras: 6, porcentaje: 50 },
      { desdeHoras: 0, porcentaje: 0 },
    ],
  },
  estricta: {
    nombre: "Estricta",
    resumen: "Devolución completa hasta 48 horas antes; la mitad hasta 24 horas antes.",
    tramos: [
      { desdeHoras: 48, porcentaje: 100 },
      { desdeHoras: 24, porcentaje: 50 },
      { desdeHoras: 0, porcentaje: 0 },
    ],
  },
};

export const POLITICA_POR_DEFECTO: Politica = "moderada";

/** Reglas que valen para TODAS las canchas, elija el dueño la política que elija. */
export const REGLAS_COMUNES = [
  "Si el dueño cancela o la cancha no se puede usar (cierre, lluvia que impide jugar, falta de luz), recibes la devolución completa o eliges otro horario.",
  "Puedes cambiar de horario una vez sin costo si avisas antes del límite de devolución completa, según disponibilidad.",
  "Si no llegas al partido sin avisar, no hay devolución.",
  "La devolución la hace el dueño por el mismo medio con que pagaste (Yape, Plin o transferencia), en un máximo de 48 horas.",
];

export function politicaDe(v: unknown): Politica {
  return v === "flexible" || v === "moderada" || v === "estricta" ? v : POLITICA_POR_DEFECTO;
}

/** Texto de cada tramo: "48 h antes o más: devolución completa". */
export function describirTramos(p: Politica): string[] {
  const t = POLITICAS[p].tramos;
  return t.map((x, i) => {
    const pct = x.porcentaje === 100 ? "devolución completa" : x.porcentaje === 0 ? "sin devolución" : `devolución del ${x.porcentaje} %`;
    if (i === 0) return `Con ${x.desdeHoras} h o más de anticipación: ${pct}`;
    const hasta = t[i - 1].desdeHoras;
    if (x.desdeHoras === 0) return `Con menos de ${hasta} h: ${pct}`;
    return `Entre ${hasta} h y ${x.desdeHoras} h antes: ${pct}`;
  });
}

/** Porcentaje que se devuelve si el jugador cancela ahora. */
export function porcentajeDevolucion(p: Politica, inicio: string, ahora = Date.now()): number {
  const horas = (new Date(inicio).getTime() - ahora) / 3_600_000;
  if (horas <= 0) return 0;
  return POLITICAS[p].tramos.find((t) => horas >= t.desdeHoras)?.porcentaje ?? 0;
}
