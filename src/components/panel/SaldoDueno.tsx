"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { fmtFecha, soles } from "@/lib/horario";

type Saldo = {
  saldo: number;
  precio_reserva: number;
  reservas_disponibles: number;
  yape_numero: string | null;
  yape_titular: string | null;
  bcp_cuenta: string | null;
  bcp_cci: string | null;
  bcp_titular: string | null;
  bono_porcentaje: number;
  bono_desde: number;
  bono_hasta: string | null;
  reservas_mes: number;
  gastado_mes: number;
};
type Recarga = { id: string; monto: number; medio: string; operacion: string; estado: string; nota: string | null; created_at: string };
type Medio = "yape" | "bcp";
type Movimiento = { id: string; tipo: string; monto: number; detalle: string | null; created_at: string };

const MONTOS = [20, 50, 100];
const MINIMO = 1;

const ERRORES: Record<string, string> = {
  monto_invalido: "El monto debe ser de S/ 1 a S/ 500.",
  operacion_invalida: "Escribe el número de operación tal como aparece en tu Yape o en tu constancia del BCP.",
  medio_no_disponible: "Ese medio de pago no está disponible ahora. Elige el otro.",
  operacion_repetida: "Ese número de operación ya se usó en otra recarga.",
  demasiadas_pendientes: "Tienes 3 recargas esperando revisión. Espera a que las aprobemos.",
  sin_permiso: "Solo los dueños pueden recargar.",
};

const ESTADO_RECARGA: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: "En revisión", clase: "bg-amber-50 text-amber-800" },
  aprobada: { texto: "Aprobada", clase: "bg-[#DCF5EA] text-[#0F7A55]" },
  rechazada: { texto: "Rechazada", clase: "bg-red-50 text-red-700" },
};

const fecha = (iso: string) => fmtFecha(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

/** Cuenta BCP con guiones (191-12345678-0-12) y CCI por bloques. */
function formatoCuenta(n: string) {
  if (n.length === 14) return n.replace(/(\d{3})(\d{8})(\d)(\d{2})/, "$1-$2-$3-$4");
  if (n.length === 13) return n.replace(/(\d{3})(\d{7})(\d)(\d{2})/, "$1-$2-$3-$4");
  if (n.length === 20) return n.replace(/(\d{3})(\d{3})(\d{12})(\d{2})/, "$1-$2-$3-$4");
  return n;
}

/** Saldo del dueño, cómo recargar por Yape o BCP y su historial. */
export default function SaldoDueno() {
  const supabase = supabaseNavegador();
  const [saldo, setSaldo] = useState<Saldo | null>(null);
  const [recargas, setRecargas] = useState<Recarga[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [falta, setFalta] = useState(false);

  const [monto, setMonto] = useState(50);
  const [otro, setOtro] = useState("");
  const [operacion, setOperacion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [medio, setMedio] = useState<Medio>("yape");

  const cargar = useCallback(async () => {
    if (!supabase) return;
    const [s, r, m] = await Promise.all([
      supabase.rpc("mi_saldo"),
      supabase.from("recargas_saldo").select("id, monto, medio, operacion, estado, nota, created_at").order("created_at", { ascending: false }).limit(20),
      supabase.from("movimientos_saldo").select("id, tipo, monto, detalle, created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    if (s.error) return setFalta(true);
    const datos = ((s.data ?? []) as Saldo[])[0] ?? null;
    setSaldo(datos);
    // Si EasyFut aún no tiene Yape pero sí BCP, empezar en BCP
    if (datos && !datos.yape_numero && datos.bcp_cuenta) setMedio("bcp");
    setRecargas((r.data ?? []) as Recarga[]);
    setMovimientos((m.data ?? []) as Movimiento[]);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const montoFinal = otro ? Number(otro.replace(",", ".")) : monto;
  const montoValido = Number.isFinite(montoFinal) && montoFinal >= MINIMO && montoFinal <= 500;
  const operacionLimpia = operacion.replace(/[\s-]/g, "").toUpperCase();
  const operacionValida = /^[0-9A-Z]{4,20}$/.test(operacionLimpia);

  async function avisar(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !montoValido || !operacionValida) return;
    setEnviando(true);
    setMensaje(null);
    const { error } = await supabase.rpc("pedir_recarga", {
      p_monto: montoFinal,
      p_operacion: operacionLimpia,
      p_medio: medio,
    });
    setEnviando(false);
    if (error) {
      const clave = Object.keys(ERRORES).find((k) => error.message.includes(k));
      return setMensaje({ tipo: "error", texto: clave ? ERRORES[clave] : "No se pudo enviar. Inténtalo de nuevo." });
    }
    setOperacion("");
    setOtro("");
    setMensaje({
      tipo: "ok",
      texto: `¡Listo! Revisaremos tu ${medio === "bcp" ? "transferencia" : "Yape"} y sumaremos el saldo. Normalmente toma unas horas.`,
    });
    cargar();
  }

  async function copiar(texto: string, clave: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(clave);
      setTimeout(() => setCopiado(null), 2000);
    } catch {}
  }

  if (falta)
    return <p className="rounded-2xl bg-white p-4 text-sm text-[#5A5A5A] shadow-sm">Falta ejecutar la migración 021 en Supabase.</p>;
  if (!saldo) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;

  const quedan = saldo.reservas_disponibles;
  const precio = Number(saldo.precio_reserva);
  const bonoPct = Number(saldo.bono_porcentaje);
  const bonoDesde = Number(saldo.bono_desde);
  /** Saldo extra de la promoción para un monto (0 si no aplica). */
  const bonoDe = (m: number) => (bonoPct > 0 && m >= bonoDesde ? Math.round(m * bonoPct) / 100 : 0);
  const reservasDe = (m: number) => Math.floor((m + bonoDe(m)) / precio);

  return (
    <div className="flex flex-col gap-5">
      {/* Saldo actual */}
      <section className="rounded-2xl bg-white p-5 text-center shadow-sm">
        <p className="text-sm text-[#5A5A5A]">Tu saldo</p>
        <p className="text-4xl font-extrabold text-[#1B1B1B]">{soles(Number(saldo.saldo))}</p>
        <p className={`mt-1 text-sm font-bold ${quedan === 0 ? "text-red-700" : quedan <= 5 ? "text-amber-700" : "text-[#6D28D9]"}`}>
          {quedan === 0
            ? "Sin saldo: tus canchas no reciben reservas"
            : `Alcanza para ${quedan} reserva${quedan === 1 ? "" : "s"}`}
        </p>
        <p className="mt-3 rounded-xl bg-[#F4F4F4] px-3 py-2 text-sm">
          Este mes: <strong>{saldo.reservas_mes} reserva{Number(saldo.reservas_mes) === 1 ? "" : "s"}</strong> ·{" "}
          {soles(Number(saldo.gastado_mes))}
        </p>
        <p className="mt-3 text-xs text-[#5A5A5A]">
          EasyFut descuenta {soles(precio)} solo cuando confirmas una reserva hecha por la app. No se cobran las vencidas,
          las canceladas antes de confirmar, los horarios bloqueados ni las reservas que anotas tú.
        </p>
      </section>

      {/* Promoción activa */}
      {bonoPct > 0 && (
        <p className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <span className="text-2xl" aria-hidden="true">
            🎁
          </span>
          <span>
            <strong>Promoción: +{bonoPct} % de saldo extra</strong> en recargas desde {soles(bonoDesde)}
            {saldo.bono_hasta ? ` hasta el ${fmtFecha(saldo.bono_hasta, { day: "numeric", month: "long" })}` : ""}.
          </span>
        </p>
      )}

      {/* Recargar */}
      <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">Recargar saldo</h2>

        {!saldo.yape_numero && !saldo.bcp_cuenta ? (
          <p className="rounded-xl bg-[#F4F4F4] p-3 text-sm text-[#5A5A5A]">
            Las recargas aún no están disponibles. Escríbenos a easyfutinquiries@gmail.com.
          </p>
        ) : (
          <form onSubmit={avisar} className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-sm font-bold">1. Elige cuánto recargar</p>
              <div className="flex flex-wrap gap-2">
                {MONTOS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMonto(m);
                      setOtro("");
                    }}
                    className={`rounded-xl border px-4 py-2 text-sm font-bold ${
                      !otro && monto === m ? "border-[#6D28D9] bg-[#6D28D9] text-white" : "border-[#E3E3E3] bg-white text-[#1B1B1B]"
                    }`}
                  >
                    {soles(m)} <span className="font-medium opacity-80">· {reservasDe(m)} reservas</span>
                    {bonoDe(m) > 0 && <span className="ml-1 rounded-full bg-amber-400 px-1.5 text-[11px] text-amber-950">+{bonoPct} %</span>}
                  </button>
                ))}
                <input
                  value={otro}
                  onChange={(e) => setOtro(e.target.value.replace(/[^\d.,]/g, ""))}
                  inputMode="decimal"
                  placeholder="Otro monto"
                  aria-label="Otro monto en soles"
                  className="w-32 rounded-xl border border-[#E3E3E3] px-3 py-2 text-sm outline-none focus:border-[#6D28D9]"
                />
              </div>
              {otro && !montoValido && <p className="mt-1 text-xs text-red-700">De S/ 1 a S/ 500.</p>}
              {montoValido && (
                <p className="mt-2 text-sm text-[#5A5A5A]">
                  Recibes <strong className="text-[#1B1B1B]">{soles(montoFinal + bonoDe(montoFinal))}</strong> de saldo ={" "}
                  {reservasDe(montoFinal)} reservas
                  {bonoDe(montoFinal) > 0 && <span className="text-amber-800"> (incluye {soles(bonoDe(montoFinal))} de bono)</span>}
                </p>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-bold">2. Elige cómo pagar</p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Medio de pago">
                {(
                  [
                    { clave: "yape", texto: "Yape", detalle: "Al instante", activo: !!saldo.yape_numero },
                    { clave: "bcp", texto: "Transferencia BCP", detalle: "O desde otro banco (CCI)", activo: !!saldo.bcp_cuenta },
                  ] as const
                )
                  .filter((m) => m.activo)
                  .map((m) => (
                    <button
                      key={m.clave}
                      type="button"
                      role="radio"
                      aria-checked={medio === m.clave}
                      onClick={() => setMedio(m.clave)}
                      className={`rounded-xl border p-3 text-left ${
                        medio === m.clave ? "border-[#6D28D9] bg-[#EDE9FE]" : "border-[#E3E3E3] bg-white"
                      }`}
                    >
                      <span className="block font-bold">{m.texto}</span>
                      <span className="block text-xs text-[#5A5A5A]">{m.detalle}</span>
                    </button>
                  ))}
              </div>
            </div>

            {medio === "yape" && saldo.yape_numero ? (
              <div className="rounded-xl bg-[#EDE9FE] p-4">
                <p className="text-sm font-bold">3. Yapea {montoValido ? soles(montoFinal) : "el monto"} a EasyFut</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-2xl font-extrabold tracking-wide text-[#4C1D95]">
                      {saldo.yape_numero.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}
                    </p>
                    {saldo.yape_titular && <p className="text-sm text-[#4C1D95]">A nombre de {saldo.yape_titular}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => copiar(saldo.yape_numero!, "yape")}
                    className="shrink-0 rounded-xl bg-white px-3 py-2 text-sm font-bold text-[#6D28D9]"
                  >
                    {copiado === "yape" ? "¡Copiado!" : "Copiar"}
                  </button>
                </div>
              </div>
            ) : saldo.bcp_cuenta ? (
              <div className="flex flex-col gap-3 rounded-xl bg-[#EDE9FE] p-4">
                <p className="text-sm font-bold">3. Transfiere {montoValido ? soles(montoFinal) : "el monto"} a EasyFut</p>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-[#4C1D95]">Cuenta BCP (soles)</p>
                    <p className="text-lg font-extrabold tracking-wide text-[#4C1D95]">{formatoCuenta(saldo.bcp_cuenta)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copiar(saldo.bcp_cuenta!, "cuenta")}
                    className="shrink-0 rounded-xl bg-white px-3 py-2 text-sm font-bold text-[#6D28D9]"
                  >
                    {copiado === "cuenta" ? "¡Copiado!" : "Copiar"}
                  </button>
                </div>
                {saldo.bcp_cci && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-[#4C1D95]">CCI (desde otros bancos)</p>
                      <p className="truncate font-bold tracking-wide text-[#4C1D95]">{formatoCuenta(saldo.bcp_cci)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copiar(saldo.bcp_cci!, "cci")}
                      className="shrink-0 rounded-xl bg-white px-3 py-2 text-sm font-bold text-[#6D28D9]"
                    >
                      {copiado === "cci" ? "¡Copiado!" : "Copiar"}
                    </button>
                  </div>
                )}
                {saldo.bcp_titular && <p className="text-sm text-[#4C1D95]">A nombre de {saldo.bcp_titular}</p>}
              </div>
            ) : null}

            <label className="flex flex-col gap-1">
              <span className="text-sm font-bold">4. Escribe el número de operación</span>
              <input
                value={operacion}
                onChange={(e) => setOperacion(e.target.value)}
                placeholder={medio === "bcp" ? "Aparece en la constancia de tu transferencia" : "Lo ves en tu Yape, en el detalle del pago"}
                autoComplete="off"
                className="rounded-xl border border-[#E3E3E3] px-3 py-3 text-base outline-none focus:border-[#6D28D9] focus:ring-2 focus:ring-[#6D28D9]/20"
              />
            </label>

            {mensaje && (
              <p
                role={mensaje.tipo === "error" ? "alert" : "status"}
                className={`rounded-xl p-3 text-sm ${mensaje.tipo === "error" ? "bg-red-50 text-red-700" : "bg-[#DCF5EA] text-[#0F7A55]"}`}
              >
                {mensaje.texto}
              </p>
            )}

            <button
              type="submit"
              disabled={!montoValido || !operacionValida || enviando}
              className="boton-morado rounded-xl py-3 font-bold text-white disabled:opacity-50"
            >
              {enviando ? "Enviando…" : medio === "bcp" ? "Ya transferí · Avisar recarga" : "Ya yapeé · Avisar recarga"}
            </button>
            <p className="text-center text-xs text-[#5A5A5A]">
              Revisamos cada pago a mano y sumamos el saldo cuando lo vemos. Las transferencias desde otros bancos pueden
              tardar más. Usa tu número de operación real: uno inventado se rechaza.
            </p>
          </form>
        )}
      </section>

      {/* Recargas avisadas */}
      {recargas.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-bold">Tus recargas</h2>
          <ul className="divide-y divide-[#E3E3E3] overflow-hidden rounded-2xl bg-white shadow-sm">
            {recargas.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                <span className="min-w-0">
                  <span className="block font-bold">{soles(Number(r.monto))}</span>
                  <span className="block truncate text-xs text-[#5A5A5A]">
                    {r.medio === "bcp" ? "BCP" : "Yape"} · operación {r.operacion} · {fecha(r.created_at)}
                  </span>
                  {r.nota && <span className="block text-xs text-[#5A5A5A]">{r.nota}</span>}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${ESTADO_RECARGA[r.estado]?.clase ?? ""}`}>
                  {ESTADO_RECARGA[r.estado]?.texto ?? r.estado}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Historial del saldo */}
      <section className="flex flex-col gap-2">
        <h2 className="font-bold">Movimientos</h2>
        {movimientos.length === 0 ? (
          <p className="rounded-2xl bg-white p-4 text-sm text-[#5A5A5A] shadow-sm">Aún no hay movimientos.</p>
        ) : (
          <ul className="divide-y divide-[#E3E3E3] overflow-hidden rounded-2xl bg-white shadow-sm">
            {movimientos.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{m.detalle ?? m.tipo}</span>
                  <span className="block text-xs text-[#5A5A5A]">{fecha(m.created_at)}</span>
                </span>
                <span className={`shrink-0 font-bold ${Number(m.monto) > 0 ? "text-[#0F7A55]" : "text-[#1B1B1B]"}`}>
                  {Number(m.monto) > 0 ? "+" : "−"}
                  {soles(Math.abs(Number(m.monto)))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
