// Utilidades de fecha/hora. El negocio opera en America/Lima (UTC-5, sin
// horario de verano), así que una fecha "YYYY-MM-DD" + minutos desde la
// medianoche se convierte a un instante exacto con el offset fijo -05:00.

export const ZONA = "America/Lima";
const OFFSET = "-05:00";

/** Fecha de hoy en Lima, formato YYYY-MM-DD. */
export function hoyLima(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
}

export function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado (igual que franjas.dia_semana). */
export function diaSemana(fecha: string): number {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay();
}

/** Instante de la medianoche (hora de Lima) de esa fecha. */
export function inicioDia(fecha: string): Date {
  return new Date(`${fecha}T00:00:00${OFFSET}`);
}

/** Instante de la fecha + minutos desde medianoche (1440 = medianoche siguiente). */
export function instante(fecha: string, minutos: number): Date {
  return new Date(inicioDia(fecha).getTime() + minutos * 60_000);
}

/** "16:00:00" → 960; "24:00:00" → 1440. */
export function aMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}

/** 960 → "16:00"; 1440 → "24:00". */
export function fmtMinutos(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function fmtDuracion(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h} h` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}

export function fmtFecha(d: Date | string, opciones: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("es-PE", { timeZone: ZONA, ...opciones }).format(
    typeof d === "string" ? new Date(d) : d
  );
}

export const soles = (n: number) => `S/ ${Number(n).toFixed(2)}`;
