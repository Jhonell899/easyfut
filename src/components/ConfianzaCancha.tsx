import { fmtFecha } from "@/lib/horario";

export type DatosConfianza = {
  promedio: number | null;
  total_resenas: number;
  partidos: number;
  dueno_verificado: boolean;
  desde: string;
  respuestas: number;
};

/** Señales de confianza de una cancha, visibles antes de reservar. */
export default function ConfianzaCancha({ c }: { c: DatosConfianza }) {
  const items: { icono: string; valor: string; texto: string; destacado?: boolean }[] = [];

  if (c.total_resenas > 0 && c.promedio != null)
    items.push({ icono: "★", valor: Number(c.promedio).toFixed(1), texto: `${c.total_resenas} reseña${c.total_resenas === 1 ? "" : "s"}` });
  items.push({ icono: "⚽", valor: String(c.partidos), texto: c.partidos === 1 ? "partido jugado" : "partidos jugados" });
  if (c.dueno_verificado) items.push({ icono: "✓", valor: "Verificado", texto: "WhatsApp del dueño", destacado: true });
  if (c.total_resenas > 0)
    items.push({
      icono: "💬",
      valor: `${Math.round((c.respuestas / c.total_resenas) * 100)} %`,
      texto: "reseñas respondidas",
    });
  items.push({ icono: "📅", valor: fmtFecha(c.desde, { month: "short", year: "numeric" }), texto: "en EasyFut desde" });

  return (
    <section aria-label="Confianza" className="sin-scroll -mx-5 flex gap-2 overflow-x-auto px-5">
      {items.map((i) => (
        <div
          key={i.texto}
          className={`flex shrink-0 flex-col rounded-2xl px-3 py-2 ${i.destacado ? "bg-[#DCF5EA]" : "bg-[#F7F8F7]"}`}
        >
          <span className={`text-sm font-extrabold ${i.destacado ? "text-[#0F7A55]" : "text-[#14231D]"}`}>
            <span aria-hidden="true" className={i.icono === "★" ? "text-amber-500" : ""}>
              {i.icono}
            </span>{" "}
            {i.valor}
          </span>
          <span className="text-[11px] text-[#5A5A5A]">{i.texto}</span>
        </div>
      ))}
    </section>
  );
}
