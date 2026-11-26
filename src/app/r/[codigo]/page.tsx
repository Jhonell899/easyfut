import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AvisoConfig from "@/components/AvisoConfig";
import { fmtFecha, soles } from "@/lib/horario";
import PagoReserva from "@/components/PagoReserva";
import AccionesReserva from "@/components/AccionesReserva";
import PedirCancelacion from "@/components/PedirCancelacion";
import CalificarReserva from "@/components/CalificarReserva";
import EnlaceChat from "@/components/EnlaceChat";

// El estado de una reserva cambia (pago, expiración): siempre datos frescos
export const dynamic = "force-dynamic";

type Reserva = {
  codigo: string;
  estado: "pendiente" | "confirmada" | "cancelada" | "expirada" | "bloqueo";
  inicio: string;
  fin: string;
  monto: number;
  cancha_nombre: string;
  direccion: string;
  expira_en: string | null;
  // Desde la migración 006
  cancha_id?: string;
  cancha_slug?: string;
  nombre_cliente?: string | null;
  medios_pago?: unknown;
  dueno_nombre?: string | null;
  dueno_celular?: string | null;
  pago_avisado_en?: string | null;
  medios_pago_cambiado_en?: string | null; // migración 015 (019: nombre nuevo)
  politica_cancelacion?: string | null; // migración 016
};

const hora = (iso: string) => fmtFecha(iso, { hour: "2-digit", minute: "2-digit", hour12: false });

const ESTADOS: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente de pago", clase: "bg-amber-50 text-amber-800" },
  revision: { texto: "Pago en revisión", clase: "bg-[#EDE9FE] text-[#6D28D9]" },
  confirmada: { texto: "Confirmada", clase: "bg-[#DCF5EA] text-[#0F7A55]" },
  cancelada: { texto: "Cancelada", clase: "bg-red-50 text-red-700" },
  expirada: { texto: "Expirada", clase: "bg-[#F4F4F4] text-[#5A5A5A]" },
};

export default async function PaginaReserva({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;

  if (!supabase) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 p-5">
        <AvisoConfig />
      </main>
    );
  }

  const { data, error } = await supabase.rpc("obtener_reserva", { p_codigo: codigo });
  const reserva = (data as Reserva[] | null)?.[0];

  if (error) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 p-5">
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          No pudimos consultar la reserva. Inténtalo de nuevo en unos minutos.
        </p>
      </main>
    );
  }
  if (!reserva || reserva.estado === "bloqueo") notFound();

  // Una pendiente cuyo plazo ya venció se muestra como expirada aunque
  // la tarea automática todavía no la haya marcado.
  const vencida =
    reserva.estado === "pendiente" &&
    !reserva.pago_avisado_en &&
    reserva.expira_en !== null &&
    new Date(reserva.expira_en).getTime() < Date.now();
  const finMs = new Date(reserva.fin).getTime();
  const jugado = finMs < Date.now();
  const haceMenosDe30Dias = Date.now() - finMs < 30 * 24 * 3600 * 1000;

  const estado =
    ESTADOS[vencida ? "expirada" : reserva.estado === "pendiente" && reserva.pago_avisado_en ? "revision" : reserva.estado];

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-5 p-5">
      <Link href="/" className="text-sm font-medium text-[#6D28D9]">
        ← Todas las canchas
      </Link>

      <div className="flex flex-col gap-2">
        <span className={`self-start rounded-full px-3 py-1 text-xs font-medium ${estado.clase}`}>
          {estado.texto}
        </span>
        <h1 className="text-2xl font-bold text-[#1B1B1B]">Reserva {reserva.codigo}</h1>
        <p className="text-sm text-[#5A5A5A]">
          Guarda este código: lo necesitas para consultar tu reserva.
        </p>
      </div>

      <dl className="divide-y divide-[#E3E3E3] rounded-2xl border border-[#E3E3E3] bg-white text-sm">
        <Fila nombre="Cancha" valor={reserva.cancha_nombre} />
        <Fila nombre="Dirección" valor={reserva.direccion} />
        <Fila
          nombre="Fecha"
          valor={fmtFecha(reserva.inicio, { weekday: "long", day: "numeric", month: "long" })}
        />
        <Fila
          nombre="Hora"
          valor={`${fmtFecha(reserva.inicio, { hour: "2-digit", minute: "2-digit", hour12: false })} – ${fmtFecha(reserva.fin, { hour: "2-digit", minute: "2-digit", hour12: false })}`}
        />
        <Fila nombre="Total" valor={soles(reserva.monto)} fuerte />
      </dl>

      {reserva.estado === "pendiente" && !vencida && (
        <PagoReserva
          codigo={reserva.codigo}
          monto={Number(reserva.monto)}
          expiraEn={reserva.expira_en}
          pagoAvisadoEn={reserva.pago_avisado_en ?? null}
          pagos={reserva.medios_pago}
          duenoNombre={reserva.dueno_nombre ?? null}
          duenoCelular={reserva.dueno_celular ?? null}
          nombreCliente={reserva.nombre_cliente ?? null}
          canchaNombre={reserva.cancha_nombre}
          canchaId={reserva.cancha_id ?? ""}
          pagosCambiadoEn={reserva.medios_pago_cambiado_en ?? null}
          cuando={`${fmtFecha(reserva.inicio, { weekday: "long", day: "numeric", month: "long" })}, ${hora(reserva.inicio)} – ${hora(reserva.fin)}`}
        />
      )}

      {reserva.estado === "confirmada" && !jugado && (
        <p className="rounded-2xl bg-[#DCF5EA] p-4 text-sm font-medium text-[#0F7A55]">
          ¡Listo! El dueño confirmó tu pago. Te esperamos en la cancha.
        </p>
      )}

      {/* Chat con el dueño: solo aparece para el dueño o el jugador, cuando el pago se confirmó en la app */}
      {reserva.estado === "confirmada" && <EnlaceChat codigo={reserva.codigo} />}

      {/* Después del partido: calificar la cancha (solo reservas pagadas, hasta 30 días) */}
      {reserva.estado === "confirmada" && jugado && haceMenosDe30Dias && (
        <CalificarReserva codigo={reserva.codigo} canchaNombre={reserva.cancha_nombre} />
      )}

      {vencida && (
        <p className="rounded-2xl bg-[#F4F4F4] p-4 text-sm text-[#5A5A5A]">
          Pasaron los 10 minutos sin aviso de pago y el horario se liberó. Puedes hacer una nueva reserva.
        </p>
      )}

      {reserva.estado === "cancelada" && (
        <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">
          Esta reserva fue cancelada y el horario quedó libre.
        </p>
      )}

      {(reserva.estado === "confirmada" || (reserva.estado === "pendiente" && !!reserva.pago_avisado_en)) && (
        <PedirCancelacion
          codigo={reserva.codigo}
          inicio={reserva.inicio}
          monto={Number(reserva.monto)}
          politica={reserva.politica_cancelacion}
          canchaNombre={reserva.cancha_nombre}
          cuando={`${fmtFecha(reserva.inicio, { weekday: "long", day: "numeric", month: "long" })}, ${hora(reserva.inicio)}`}
          duenoCelular={reserva.dueno_celular ?? null}
        />
      )}

      <AccionesReserva
        codigo={reserva.codigo}
        canchaNombre={reserva.cancha_nombre}
        direccion={reserva.direccion}
        inicio={reserva.inicio}
        fin={reserva.fin}
        cuando={`${fmtFecha(reserva.inicio, { weekday: "long", day: "numeric", month: "long" })}, ${hora(reserva.inicio)} – ${hora(reserva.fin)}`}
        puedeCancelar={reserva.estado === "pendiente" && !vencida && !reserva.pago_avisado_en}
        activa={reserva.estado === "confirmada" || (reserva.estado === "pendiente" && !vencida)}
      />

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-[#6D28D9]">
        <Link href="/reservas">Ver mis reservas</Link>
        {reserva.cancha_slug && <Link href={`/c/${reserva.cancha_slug}`}>Reservar otra vez en esta cancha</Link>}
      </div>
    </main>
  );
}

function Fila({ nombre, valor, fuerte }: { nombre: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="flex justify-between gap-4 p-4">
      <dt className="text-[#5A5A5A]">{nombre}</dt>
      <dd className={`text-right ${fuerte ? "font-bold" : ""} text-[#1B1B1B]`}>
        {valor}
      </dd>
    </div>
  );
}
