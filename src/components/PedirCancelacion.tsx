"use client";

import { useEffect, useState } from "react";
import { POLITICAS, politicaDe, porcentajeDevolucion } from "@/lib/politicas";
import { soles } from "@/lib/horario";

/**
 * Reserva ya pagada: muestra cuánto le corresponde al jugador si cancela ahora,
 * según la política de la cancha, y le permite pedirlo al dueño por WhatsApp.
 * EasyFut no maneja el dinero: la devolución la hace el dueño.
 */
export default function PedirCancelacion({
  codigo,
  inicio,
  monto,
  politica,
  canchaNombre,
  cuando,
  duenoCelular,
}: {
  codigo: string;
  inicio: string;
  monto: number;
  politica: unknown;
  canchaNombre: string;
  cuando: string;
  duenoCelular: string | null;
}) {
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    setAhora(Date.now());
    const t = setInterval(() => setAhora(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  if (ahora === null || new Date(inicio).getTime() <= ahora) return null;

  const clave = politicaDe(politica);
  const pct = porcentajeDevolucion(clave, inicio, ahora);
  const devolucion = Math.round(monto * pct) / 100;
  const celular = duenoCelular?.replace(/\D/g, "").slice(-9) ?? "";

  const mensaje = [
    `Hola, quiero cancelar mi reserva ${codigo} en ${canchaNombre} (${cuando}).`,
    pct > 0
      ? `Según la política ${POLITICAS[clave].nombre}, me corresponde una devolución de ${soles(devolucion)} (${pct} %).`
      : `Sé que según la política ${POLITICAS[clave].nombre} ya no corresponde devolución.`,
  ].join("\n");

  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-[#E3E3E3] bg-white p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold">¿No puedes ir?</h2>
        <span className="rounded-full bg-[#EDE9FE] px-2 py-0.5 text-[11px] font-bold text-[#6D28D9]">
          Política {POLITICAS[clave].nombre}
        </span>
      </div>
      <p className="text-[#4A4A4A]">
        {pct === 100
          ? <>Si cancelas ahora te corresponde la <strong>devolución completa: {soles(devolucion)}</strong>. También puedes cambiar de horario una vez.</>
          : pct > 0
            ? <>Si cancelas ahora te corresponde una <strong>devolución de {soles(devolucion)}</strong> ({pct} %).</>
            : <>Ya pasó el plazo de devolución de esta cancha. Si el dueño cancela o la cancha no se puede usar, igual recibes la devolución completa.</>}
      </p>
      {celular && (
        <a
          href={`https://wa.me/51${celular}?text=${encodeURIComponent(mensaje)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="self-start rounded-xl border border-[#6D28D9] px-4 py-2 font-bold text-[#6D28D9]"
        >
          Pedir cancelación al dueño
        </a>
      )}
      <a href="/terminos" className="text-xs text-[#8A968F] underline">
        Cómo funcionan las cancelaciones
      </a>
    </section>
  );
}
