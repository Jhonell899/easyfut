"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { pagosDe } from "@/lib/rentador";
import { soles } from "@/lib/horario";

type Props = {
  codigo: string;
  monto: number;
  expiraEn: string | null;
  pagoAvisadoEn: string | null;
  pagos: unknown;
  duenoNombre: string | null;
  duenoCelular: string | null;
  nombreCliente: string | null;
  canchaNombre: string;
  canchaId: string;
  cuando: string; // "sábado 15 de noviembre, 19:00 – 20:00"
  /** Última vez que el dueño cambió sus medios de pago (migración 015). */
  pagosCambiadoEn?: string | null;
};

type Medio = { clave: string; titulo: string; dato: string; detalle?: string };

function mmss(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Pago de una reserva pendiente: medios del dueño + "Ya pagué" (aviso por WhatsApp). */
export default function PagoReserva(p: Props) {
  const router = useRouter();
  const pagos = pagosDe(p.pagos);
  // null hasta montar en el navegador (evita diferencias con el HTML del servidor)
  const [ahora, setAhora] = useState<number | null>(null);
  const [origen, setOrigen] = useState("");
  const [avisando, setAvisando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  // El cliente debe confirmar que el nombre que le muestra Yape/Plin coincide
  const [nombreVerificado, setNombreVerificado] = useState(false);

  const medios: Medio[] = [
    pagos.yape && { clave: "Yape", titulo: "Yape", dato: pagos.yape },
    pagos.plin && { clave: "Plin", titulo: "Plin", dato: pagos.plin },
    pagos.cuenta && { clave: "Transferencia", titulo: `Cuenta ${pagos.banco}`, dato: pagos.cuenta },
    pagos.cci && { clave: "Transferencia", titulo: "CCI", dato: pagos.cci },
  ].filter(Boolean) as Medio[];
  const [medio, setMedio] = useState(medios[0]?.clave ?? "");

  const avisado = !!p.pagoAvisadoEn;
  const restante = p.expiraEn && ahora !== null ? new Date(p.expiraEn).getTime() - ahora : null;

  // Reloj y actualización del estado (para ver cuando el dueño confirme)
  useEffect(() => {
    setAhora(Date.now());
    setOrigen(window.location.origin);
    const reloj = setInterval(() => setAhora(Date.now()), 1000);
    const refresco = setInterval(() => router.refresh(), 10000);
    return () => {
      clearInterval(reloj);
      clearInterval(refresco);
    };
  }, [router]);

  useEffect(() => {
    if (restante !== null && restante <= 0 && !avisado) router.refresh();
  }, [restante, avisado, router]);

  // "hace 3 horas" si el dueño cambió sus medios de pago en las últimas 48 h
  const cambioReciente = (() => {
    if (!p.pagosCambiadoEn || ahora === null) return null;
    const horas = (ahora - new Date(p.pagosCambiadoEn).getTime()) / 3600000;
    if (horas < 0 || horas > 48) return null;
    if (horas < 1) return "hace menos de una hora";
    if (horas < 24) return `hace ${Math.round(horas)} hora${Math.round(horas) === 1 ? "" : "s"}`;
    return "ayer";
  })();

  const celularDueno = p.duenoCelular?.replace(/\D/g, "").slice(-9) ?? "";
  const mensaje = [
    `Hola${p.duenoNombre ? ` ${p.duenoNombre.split(" ")[0]}` : ""}, soy ${p.nombreCliente ?? "un cliente"}.`,
    `Reservé ${p.canchaNombre} el ${p.cuando}.`,
    `Código: ${p.codigo}. Ya te pagué ${soles(p.monto)}${medio ? ` por ${medio}` : ""}.`,
    `Confírmala aquí: ${origen}/panel/c/${p.canchaId}`,
  ].join("\n");
  const whatsapp = celularDueno ? `https://wa.me/51${celularDueno}?text=${encodeURIComponent(mensaje)}` : null;

  async function yaPague() {
    if (!supabase) return;
    setAvisando(true);
    setError(null);
    const { error } = await supabase.rpc("avisar_pago", { p_codigo: p.codigo });
    if (error) {
      setAvisando(false);
      return setError(
        /reserva_vencida/.test(error.message)
          ? "El plazo de 10 minutos ya venció y el horario se liberó."
          : /avisar_pago|does not exist|schema cache/i.test(error.message)
            ? "Falta ejecutar la migración 006 en Supabase."
            : "No pudimos registrar tu aviso. Inténtalo de nuevo."
      );
    }
    if (whatsapp) window.location.href = whatsapp;
    else router.refresh();
    setAvisando(false);
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(texto);
      setTimeout(() => setCopiado(null), 1500);
    } catch {}
  }

  // --- Ya avisó: esperando al dueño -----------------------------------------
  if (avisado) {
    return (
      <section className="flex flex-col gap-3 rounded-2xl bg-[#EDE9FE] p-4 text-sm text-[#6D28D9]">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#18A058] opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-[#18A058]" />
          </span>
          <p className="font-bold">Tu horario está separado. Esperando que el dueño confirme tu pago.</p>
        </div>
        <p className="text-[#4C1D95]">
          Ya no se cae: queda reservado hasta que {p.duenoNombre?.split(" ")[0] ?? "el dueño"} revise su{" "}
          {medio || "cuenta"} y lo confirme. Esta página se actualiza sola.
        </p>
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="self-start font-bold underline-offset-2 hover:underline">
            Escribirle otra vez por WhatsApp
          </a>
        )}
      </section>
    );
  }

  // --- Venció sin aviso ------------------------------------------------------
  if (restante !== null && restante <= 0) {
    return (
      <p className="rounded-2xl bg-[#F4F4F4] p-4 text-sm text-[#5A5A5A]">
        Pasaron los 10 minutos sin aviso de pago y el horario se liberó. Puedes hacer una nueva reserva.
      </p>
    );
  }

  // --- Pendiente: pagar ------------------------------------------------------
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-[#E3E3E3] bg-white p-4">
      <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-3 py-2 text-amber-900">
        <span className="text-sm">Paga y avisa antes de</span>
        <span className="font-mono text-xl font-bold tabular-nums">{restante !== null ? mmss(restante) : "--:--"}</span>
      </div>

      <div>
        <p className="text-sm text-[#5A5A5A]">Paga exactamente</p>
        <button type="button" onClick={() => copiar(String(p.monto))} className="text-3xl font-extrabold text-[#1B1B1B]">
          {soles(p.monto)}
        </button>
      </div>

      {/* Aviso si el dueño cambió sus datos de pago en las últimas 48 horas */}
      {cambioReciente && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          <strong>Atención:</strong> los datos de pago de esta cancha se actualizaron {cambioReciente}. Antes de pagar,
          comprueba el nombre del titular{whatsapp ? " o confírmalo con el dueño por WhatsApp" : ""}.
        </p>
      )}

      {/* Verificación del titular: evita pagar a un número equivocado */}
      {pagos.titular && (
        <div className="flex flex-col gap-2 rounded-xl border-2 border-[#6D28D9] bg-[#F5F3FF] p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[#6D28D9]">Paga solo si el nombre coincide</p>
          <p className="text-xl font-extrabold leading-tight text-[#14231D]">{pagos.titular}</p>
          <p className="text-xs text-[#5A5A5A]">
            Yape y Plin muestran el nombre de quien recibe antes de confirmar el pago. Si aparece otro nombre,{" "}
            <strong>no pagues</strong>.
          </p>
        </div>
      )}

      {pagos.qr && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pagos.qr} alt="QR para pagar" className="mx-auto h-56 w-56 rounded-xl border border-[#E3E3E3] object-contain" />
      )}

      {/* Referencia única: el dueño la busca en su app para conciliar el pago */}
      <div className="flex items-center justify-between gap-3 rounded-xl bg-[#0A3D2E] px-3 py-2.5 text-white">
        <span className="text-sm leading-tight">
          Escribe este código en el <strong>mensaje</strong> del Yape o Plin
        </span>
        <button
          type="button"
          onClick={() => copiar(p.codigo)}
          className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 font-mono text-base font-bold tracking-wider ring-1 ring-white/30"
        >
          {copiado === p.codigo ? "¡Copiado!" : p.codigo}
        </button>
      </div>

      {medios.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {medios.map((m) => (
            <li key={m.titulo}>
              <button
                type="button"
                onClick={() => {
                  setMedio(m.clave);
                  copiar(m.dato);
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border-2 px-3 py-2.5 text-left ${
                  medio === m.clave ? "border-[#6D28D9] bg-[#F5F3FF]" : "border-[#E3E3E3]"
                }`}
              >
                <span>
                  <span className="block text-xs text-[#5A5A5A]">{m.titulo}</span>
                  <span className="font-mono text-base font-bold tracking-wide">{m.dato}</span>
                </span>
                <span className="text-xs font-bold text-[#6D28D9]">{copiado === m.dato ? "¡Copiado!" : "Copiar"}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !pagos.qr && (
          <p className="rounded-xl bg-[#F4F4F4] p-3 text-sm text-[#5A5A5A]">
            Coordina el pago con el dueño por WhatsApp.
          </p>
        )
      )}

      {pagos.titular && (
        <label className="flex items-start gap-3 rounded-xl bg-[#F7F8F7] p-3 text-sm">
          <input
            type="checkbox"
            checked={nombreVerificado}
            onChange={(e) => setNombreVerificado(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#6D28D9]"
          />
          <span>
            Al pagar, el nombre que apareció fue <strong>{pagos.titular}</strong>.
          </span>
        </label>
      )}

      <button
        type="button"
        onClick={yaPague}
        disabled={avisando || (!!pagos.titular && !nombreVerificado)}
        className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] py-3.5 font-bold text-white disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z" />
        </svg>
        {avisando ? "Avisando…" : "Ya pagué · Avisar al dueño por WhatsApp"}
      </button>
      <p className="text-center text-xs text-[#5A5A5A]">
        Al avisar, tu horario queda separado hasta que el dueño confirme el pago.
      </p>

      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
