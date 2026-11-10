"use client";

import { useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { diaSemana, fmtFecha, hoyLima, inicioDia, soles, sumarDias } from "@/lib/horario";

type Fila = { monto: number; inicio: string };

/** Ingresos confirmados del dueño: hoy, esta semana y este mes, con una barra por día. */
export default function IngresosDueno({ duenoId }: { duenoId: string }) {
  const [filas, setFilas] = useState<Fila[] | null>(null);

  const hoy = hoyLima();
  const lunes = sumarDias(hoy, -((diaSemana(hoy) + 6) % 7));
  const inicioMes = `${hoy.slice(0, 8)}01`;
  const desde = inicioMes < lunes ? inicioMes : lunes;

  useEffect(() => {
    supabaseNavegador()
      ?.from("reservas")
      .select("monto, inicio, canchas!inner(dueno_id)")
      .eq("canchas.dueno_id", duenoId)
      .eq("estado", "confirmada")
      .gte("inicio", inicioDia(desde).toISOString())
      .lt("inicio", inicioDia(sumarDias(hoy, 1)).toISOString())
      .then(({ data }) => setFilas((data ?? []) as unknown as Fila[]));
  }, [duenoId, desde, hoy]);

  if (!filas) return <div className="h-28 animate-pulse rounded-2xl bg-white" />;

  const entre = (a: string, b: string) => {
    const [ini, fin] = [inicioDia(a).getTime(), inicioDia(b).getTime()];
    return filas.filter((f) => {
      const t = new Date(f.inicio).getTime();
      return t >= ini && t < fin;
    });
  };
  const suma = (l: Fila[]) => l.reduce((s, f) => s + Number(f.monto), 0);
  const manana = sumarDias(hoy, 1);

  const semana = Array.from({ length: 7 }, (_, i) => {
    const d = sumarDias(lunes, i);
    return { d, total: d <= hoy ? suma(entre(d, sumarDias(d, 1))) : 0, futuro: d > hoy };
  });
  const maximo = Math.max(1, ...semana.map((x) => x.total));
  const delMes = entre(inicioMes, manana);

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="font-bold">Ingresos confirmados</h2>
        <span className="text-xs text-[#8A968F] first-letter:uppercase">
          {fmtFecha(inicioDia(hoy), { month: "long", year: "numeric" })}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Cifra valor={soles(suma(entre(hoy, manana)))} texto="Hoy" />
        <Cifra valor={soles(suma(entre(lunes, manana)))} texto="Esta semana" />
        <Cifra valor={soles(suma(delMes))} texto={`Este mes · ${delMes.length} reserva${delMes.length === 1 ? "" : "s"}`} />
      </div>

      {/* Barras de lunes a domingo */}
      <div className="flex h-20 items-end gap-1.5" role="img" aria-label="Ingresos por día de esta semana">
        {semana.map((x) => (
          <div key={x.d} className="flex flex-1 flex-col items-center gap-1">
            <div
              title={soles(x.total)}
              className={`w-full rounded-t-md ${x.d === hoy ? "bg-[#6D28D9]" : x.futuro ? "bg-[#F2F2F2]" : "bg-[#C4B5FD]"}`}
              style={{ height: `${Math.max(4, (x.total / maximo) * 56)}px` }}
            />
            <span className={`text-[10px] ${x.d === hoy ? "font-bold text-[#6D28D9]" : "text-[#8A968F]"}`}>
              {["D", "L", "M", "M", "J", "V", "S"][diaSemana(x.d)]}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-[#8A968F]">Solo cuenta reservas con pago confirmado, hasta hoy.</p>
    </section>
  );
}

function Cifra({ valor, texto }: { valor: string; texto: string }) {
  return (
    <div className="rounded-xl bg-[#F7F8F7] px-1 py-2">
      <p className="text-base font-extrabold text-[#1B1B1B]">{valor}</p>
      <p className="text-[10px] text-[#5A5A5A]">{texto}</p>
    </div>
  );
}
