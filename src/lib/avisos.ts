import { fmtFecha } from "@/lib/horario";

const hora = (iso: string) => fmtFecha(iso, { hour: "2-digit", minute: "2-digit", hour12: false });

/** Enlace de WhatsApp para avisarle al cliente que su reserva quedó confirmada. */
export function enlaceAvisoConfirmada(r: {
  nombre_cliente: string | null;
  celular_cliente: string | null;
  inicio: string;
  fin: string;
  codigo: string;
}, cancha: string): string | null {
  if (!r.celular_cliente || !/^9\d{8}$/.test(r.celular_cliente)) return null;
  const texto = [
    `Hola ${r.nombre_cliente?.split(" ")[0] ?? ""}, tu reserva en ${cancha} está CONFIRMADA ✅`,
    `${fmtFecha(r.inicio, { weekday: "long", day: "numeric", month: "long" })}, ${hora(r.inicio)} – ${hora(r.fin)}`,
    `Código: ${r.codigo}. ¡Te esperamos!`,
  ].join("\n");
  return `https://wa.me/51${r.celular_cliente}?text=${encodeURIComponent(texto)}`;
}
