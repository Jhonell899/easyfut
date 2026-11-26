import { Tarjeta, cx } from "@/components/ui";
import { fmtFecha, soles } from "@/lib/horario";
import { calculadora, type Saldo } from "./tipos";

/** Saldo actual, cuántas reservas alcanza y lo gastado este mes. */
export function ResumenSaldo({ saldo }: { saldo: Saldo }) {
  const quedan = saldo.reservas_disponibles;
  const { precio } = calculadora(saldo);
  return (
    <Tarjeta className="items-center text-center">
      <p className="text-sm text-tinta-suave">Tu saldo</p>
      <p className="text-4xl font-extrabold text-tinta">{soles(Number(saldo.saldo))}</p>
      <p className={cx("text-sm font-bold", quedan === 0 ? "text-red-700" : quedan <= 5 ? "text-amber-700" : "text-marca")}>
        {quedan === 0 ? "Sin saldo: tus canchas no reciben reservas" : `Alcanza para ${quedan} reserva${quedan === 1 ? "" : "s"}`}
      </p>
      <p className="w-full rounded-xl bg-superficie-suave px-3 py-2 text-sm">
        Este mes: <strong>{saldo.reservas_mes} reserva{Number(saldo.reservas_mes) === 1 ? "" : "s"}</strong> ·{" "}
        {soles(Number(saldo.gastado_mes))}
      </p>
      <p className="text-xs text-tinta-suave">
        EasyFut descuenta {soles(precio)} solo cuando confirmas una reserva hecha por la app. No se cobran las vencidas, las
        canceladas antes de confirmar, los horarios bloqueados ni las reservas que anotas tú.
      </p>
    </Tarjeta>
  );
}

/** Cartel de la promoción de recarga activa (si hay). */
export function PromoActiva({ saldo }: { saldo: Saldo }) {
  const { bonoPct, bonoDesde } = calculadora(saldo);
  if (bonoPct <= 0) return null;
  return (
    <Tarjeta tono="aviso" como="div">
      <p className="flex items-center gap-3 text-sm">
        <span className="text-2xl" aria-hidden="true">
          🎁
        </span>
        <span>
          <strong>Promoción: +{bonoPct} % de saldo extra</strong> en recargas desde {soles(bonoDesde)}
          {saldo.bono_hasta ? ` hasta el ${fmtFecha(saldo.bono_hasta, { day: "numeric", month: "long" })}` : ""}.
        </span>
      </p>
    </Tarjeta>
  );
}
