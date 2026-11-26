"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { fmtFecha, soles } from "@/lib/horario";

type Recarga = {
  id: string;
  dueno_id: string;
  dueno_nombre: string | null;
  dueno_correo: string | null;
  monto: number;
  medio: string;
  operacion: string;
  codigo_seguridad: string | null;
  pagador_nombre: string | null;
  pagador_celular: string | null;
  estado: string;
  verificacion: string;
  verificada_por: string | null;
  nota: string | null;
  created_at: string;
  saldo: number;
};
type Aviso = {
  id: string;
  medio: string;
  monto: number;
  operacion: string | null;
  nombre: string | null;
  celular: string | null;
  fecha: string | null;
  resultado: string;
  created_at: string;
};
type SaldoDueno = {
  dueno_id: string;
  dueno_nombre: string | null;
  dueno_correo: string | null;
  saldo: number;
  cobradas_30_dias: number;
  rechazos_30_dias: number;
  recarga_auto_bloqueada: boolean;
};
type Promo = { porcentaje: number; desde: number; hasta: string | null };

/** Etiqueta Yape / BCP. */
function EtiquetaMedio({ medio }: { medio: string }) {
  return (
    <span
      className={`mr-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
        medio === "bcp" ? "bg-[#E0ECFF] text-[#003A8C]" : "bg-[#EDE9FE] text-[#6D28D9]"
      }`}
    >
      {medio === "bcp" ? "BCP" : "Yape"}
    </span>
  );
}

/** De quién debe venir el pago para darlo por bueno. */
function DebeVenirDe({ r }: { r: Recarga }) {
  return (
    <p className="mt-1 rounded-lg bg-[#F4F4F4] px-2 py-1 text-xs">
      Debe venir de <strong>{r.pagador_nombre ?? r.dueno_nombre ?? "el dueño"}</strong>
      {r.medio === "yape" && r.pagador_celular ? (
        <>
          {" "}
          · desde el <strong>{r.pagador_celular}</strong>
        </>
      ) : null}
      <span className="block text-[#5A5A5A]">{r.dueno_correo}</span>
    </p>
  );
}

const fecha = (iso: string) => fmtFecha(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

/** Yape de EasyFut, recargas por aprobar y saldo de cada dueño. */
export default function AdminRecargas() {
  const supabase = supabaseNavegador();
  const [recargas, setRecargas] = useState<Recarga[] | null>(null);
  const [saldos, setSaldos] = useState<SaldoDueno[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const [yapeNumero, setYapeNumero] = useState("");
  const [yapeTitular, setYapeTitular] = useState("");
  const [yapeMensaje, setYapeMensaje] = useState<string | null>(null);
  const [yapeGuardado, setYapeGuardado] = useState<{ numero: string; titular: string } | null>(null);
  const [editandoYape, setEditandoYape] = useState(false);

  const [ajuste, setAjuste] = useState<{ dueno: string; monto: string; nota: string } | null>(null);

  // Recarga al instante y avisos del banco
  const [autoHasta, setAutoHasta] = useState("");
  const [autoPorDia, setAutoPorDia] = useState("");
  const [limitesMensaje, setLimitesMensaje] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [claveNueva, setClaveNueva] = useState<string | null>(null);

  // Cuenta BCP de EasyFut
  const [bcpCuenta, setBcpCuenta] = useState("");
  const [bcpCci, setBcpCci] = useState("");
  const [bcpTitular, setBcpTitular] = useState("");
  const [bcpGuardado, setBcpGuardado] = useState<{ cuenta: string; cci: string | null; titular: string } | null>(null);
  const [editandoBcp, setEditandoBcp] = useState(false);
  const [bcpMensaje, setBcpMensaje] = useState<string | null>(null);

  // Promoción de recarga
  const [promo, setPromo] = useState<Promo | null>(null);
  const [editandoPromo, setEditandoPromo] = useState(false);
  const [promoPct, setPromoPct] = useState("10");
  const [promoDesde, setPromoDesde] = useState("50");
  const [promoHasta, setPromoHasta] = useState("");
  const [promoMensaje, setPromoMensaje] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!supabase) return;
    const [r, s, a, av] = await Promise.all([
      supabase.rpc("admin_recargas"),
      supabase.rpc("admin_saldos"),
      supabase
        .from("ajustes_easyfut")
        .select(
          "yape_numero, yape_titular, bcp_cuenta, bcp_cci, bcp_titular, bono_porcentaje, bono_desde, bono_hasta, auto_hasta, auto_por_dia"
        )
        .maybeSingle(),
      supabase.rpc("admin_avisos_banco"),
    ]);
    if (r.error) {
      setError(/sin_permiso/.test(r.error.message) ? "Tu cuenta no es administradora." : "Falta ejecutar la migración 022 en Supabase.");
      return setRecargas([]);
    }
    setRecargas((r.data ?? []) as Recarga[]);
    setSaldos((s.data ?? []) as SaldoDueno[]);
    setAvisos((av.data ?? []) as Aviso[]);
    const ajustes = a.data as {
      yape_numero: string | null;
      yape_titular: string | null;
      bcp_cuenta: string | null;
      bcp_cci: string | null;
      bcp_titular: string | null;
      bono_porcentaje: number;
      bono_desde: number;
      bono_hasta: string | null;
      auto_hasta: number;
      auto_por_dia: number;
    } | null;
    if (ajustes) {
      setYapeNumero((v) => v || ajustes.yape_numero || "");
      setYapeTitular((v) => v || ajustes.yape_titular || "");
      setYapeGuardado(ajustes.yape_numero ? { numero: ajustes.yape_numero, titular: ajustes.yape_titular ?? "" } : null);
      setBcpCuenta((v) => v || ajustes.bcp_cuenta || "");
      setBcpCci((v) => v || ajustes.bcp_cci || "");
      setBcpTitular((v) => v || ajustes.bcp_titular || "");
      setBcpGuardado(
        ajustes.bcp_cuenta ? { cuenta: ajustes.bcp_cuenta, cci: ajustes.bcp_cci, titular: ajustes.bcp_titular ?? "" } : null
      );
      setAutoHasta((v) => v || String(Number(ajustes.auto_hasta)));
      setAutoPorDia((v) => v || String(Number(ajustes.auto_por_dia)));
      const pct = Number(ajustes.bono_porcentaje);
      const vencida = ajustes.bono_hasta ? new Date(ajustes.bono_hasta).getTime() <= Date.now() : false;
      setPromo(pct > 0 && !vencida ? { porcentaje: pct, desde: Number(ajustes.bono_desde), hasta: ajustes.bono_hasta } : null);
    }
  }, [supabase]);

  /** Bono que recibiría una recarga pendiente con la promoción de hoy. */
  const bonoDe = (r: Recarga) =>
    promo && Number(r.monto) >= promo.desde && (!promo.hasta || new Date(r.created_at) <= new Date(promo.hasta))
      ? Math.round(Number(r.monto) * promo.porcentaje) / 100
      : 0;

  async function guardarBcp(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBcpMensaje(null);
    const { error } = await supabase.rpc("admin_guardar_bcp", {
      p_cuenta: bcpCuenta,
      p_cci: bcpCci,
      p_titular: bcpTitular,
    });
    if (error) return setBcpMensaje("Revisa la cuenta (13 o 14 dígitos), el CCI (20 dígitos, opcional) y el titular.");
    setEditandoBcp(false);
    cargar();
  }

  async function guardarPromo(e: React.FormEvent | null, apagar = false) {
    e?.preventDefault();
    if (!supabase) return;
    setPromoMensaje(null);
    // La fecha "hasta" vale hasta el final de ese día en Lima
    const hasta = !apagar && promoHasta ? new Date(`${promoHasta}T23:59:59-05:00`).toISOString() : null;
    const { error } = await supabase.rpc("admin_guardar_promocion", {
      p_porcentaje: apagar ? 0 : Number(promoPct),
      p_desde: Number(promoDesde) || 50,
      p_hasta: hasta,
    });
    if (error) return setPromoMensaje("Revisa los datos: porcentaje de 1 a 100, monto mínimo desde S/ 10 y una fecha futura.");
    setEditandoPromo(false);
    cargar();
  }

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardarYape(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setYapeMensaje(null);
    const { error } = await supabase.rpc("admin_guardar_yape", {
      p_numero: yapeNumero.replace(/\D/g, ""),
      p_titular: yapeTitular,
    });
    if (error) return setYapeMensaje("Revisa el número (9 dígitos, empieza con 9) y el titular.");
    setYapeMensaje(null);
    setEditandoYape(false);
    cargar();
  }

  async function revisar(r: Recarga, aprobar: boolean) {
    if (!supabase) return;
    const nota = aprobar ? "" : window.prompt("Motivo del rechazo (lo verá el dueño):", "No encontramos ese Yape") ?? null;
    if (nota === null) return;
    setOcupado(r.id);
    const { error } = await supabase.rpc("admin_revisar_recarga", { p_id: r.id, p_aprobar: aprobar, p_nota: nota });
    setOcupado(null);
    if (error) window.alert(/ya_revisada/.test(error.message) ? "Esa recarga ya fue revisada." : "No se pudo guardar.");
    cargar();
  }

  async function verificar(r: Recarga, llego: boolean) {
    if (!supabase) return;
    const nota = llego
      ? ""
      : window.prompt(
          "Se le quitará el saldo de esta recarga y ya no podrá recargar al instante. Motivo (lo verá el dueño):",
          "El pago no llegó"
        ) ?? null;
    if (nota === null) return;
    setOcupado(r.id);
    const { error } = await supabase.rpc("admin_verificar_recarga", { p_id: r.id, p_llego: llego, p_nota: nota });
    setOcupado(null);
    if (error) window.alert(/ya_verificada/.test(error.message) ? "Esa recarga ya fue verificada." : "No se pudo guardar.");
    cargar();
  }

  async function guardarLimites(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    const { error } = await supabase.rpc("admin_guardar_limites_auto", {
      p_hasta: Number(autoHasta || 0),
      p_por_dia: Number(autoPorDia || 0),
    });
    setLimitesMensaje(error ? "Revisa los montos (hasta S/ 500 por recarga y S/ 2000 al día)." : "Guardado.");
    if (!error) cargar();
  }

  async function generarClave() {
    if (!supabase) return;
    if (!window.confirm("Se creará una clave nueva y la anterior dejará de funcionar. ¿Continuar?")) return;
    const { data, error } = await supabase.rpc("admin_generar_clave_avisos");
    if (error) return window.alert("No se pudo generar la clave.");
    setClaveNueva(String(data));
  }

  async function permitirAuto(dueno: string, permitir: boolean) {
    if (!supabase) return;
    const { error } = await supabase.rpc("admin_permitir_recarga_auto", { p_dueno: dueno, p_permitir: permitir });
    if (error) return window.alert("No se pudo guardar.");
    cargar();
  }

  async function guardarAjuste(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !ajuste) return;
    const { error } = await supabase.rpc("admin_ajustar_saldo", {
      p_dueno: ajuste.dueno,
      p_monto: Number(ajuste.monto.replace(",", ".")),
      p_nota: ajuste.nota,
    });
    if (error) return window.alert("Revisa el monto (no 0, máximo 1000) y escribe un motivo.");
    setAjuste(null);
    cargar();
  }

  if (recargas === null) return <div className="h-32 animate-pulse rounded-2xl bg-white" />;

  const pendientes = recargas.filter((r) => r.estado === "pendiente");
  const porVerificar = recargas.filter((r) => r.verificacion === "por_verificar");
  const revisadas = recargas.filter((r) => r.estado !== "pendiente" && r.verificacion !== "por_verificar");

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* Yape de EasyFut: una línea; el formulario solo al cambiarlo */}
      {yapeGuardado && !editandoYape ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#EDE9FE] p-4">
          <div className="min-w-0">
            <p className="text-xs text-[#4C1D95]">Los dueños yapean a</p>
            <p className="truncate font-extrabold text-[#4C1D95]">
              {yapeGuardado.numero.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}
              {yapeGuardado.titular && <span className="font-medium"> · {yapeGuardado.titular}</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditandoYape(true)}
            className="shrink-0 rounded-xl bg-white px-3 py-2 text-sm font-bold text-[#6D28D9]"
          >
            Cambiar
          </button>
        </div>
      ) : (
      <form onSubmit={guardarYape} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div>
          <h2 className="font-bold">Yape de EasyFut</h2>
          <p className="text-xs text-[#5A5A5A]">
            {yapeGuardado
              ? "A este número yapean los dueños para recargar su saldo."
              : "Falta tu Yape: sin él, los dueños no pueden recargar."}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={yapeNumero}
            onChange={(e) => setYapeNumero(e.target.value)}
            inputMode="numeric"
            placeholder="987 654 321"
            aria-label="Número de Yape"
            className="flex-1 rounded-xl border border-[#E3E3E3] px-3 py-2 text-sm outline-none focus:border-[#6D28D9]"
          />
          <input
            value={yapeTitular}
            onChange={(e) => setYapeTitular(e.target.value)}
            placeholder="Nombre que aparece en Yape"
            aria-label="Titular del Yape"
            className="flex-1 rounded-xl border border-[#E3E3E3] px-3 py-2 text-sm outline-none focus:border-[#6D28D9]"
          />
          <button type="submit" className="boton-morado rounded-xl px-4 py-2 text-sm font-bold text-white">
            Guardar
          </button>
        </div>
        {yapeMensaje && <p className="text-xs text-red-700">{yapeMensaje}</p>}
      </form>
      )}

      {/* Cuenta BCP de EasyFut: una línea; el formulario solo al cambiarla */}
      {bcpGuardado && !editandoBcp ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#E0ECFF] p-4">
          <div className="min-w-0">
            <p className="text-xs text-[#003A8C]">O transfieren a tu BCP</p>
            <p className="truncate font-extrabold text-[#003A8C]">
              {bcpGuardado.cuenta}
              {bcpGuardado.titular && <span className="font-medium"> · {bcpGuardado.titular}</span>}
            </p>
            {bcpGuardado.cci && <p className="truncate text-xs text-[#003A8C]">CCI {bcpGuardado.cci}</p>}
          </div>
          <button
            type="button"
            onClick={() => setEditandoBcp(true)}
            className="shrink-0 rounded-xl bg-white px-3 py-2 text-sm font-bold text-[#003A8C]"
          >
            Cambiar
          </button>
        </div>
      ) : (
        <form onSubmit={guardarBcp} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <div>
            <h2 className="font-bold">Cuenta BCP de EasyFut</h2>
            <p className="text-xs text-[#5A5A5A]">
              {bcpGuardado
                ? "Los dueños pueden transferir a esta cuenta para recargar."
                : "Opcional: agrégala para que los dueños también puedan recargar por transferencia."}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              value={bcpCuenta}
              onChange={(e) => setBcpCuenta(e.target.value)}
              inputMode="numeric"
              placeholder="Cuenta (191-...)"
              aria-label="Número de cuenta BCP"
              className="rounded-xl border border-[#E3E3E3] px-3 py-2 text-sm outline-none focus:border-[#6D28D9]"
            />
            <input
              value={bcpCci}
              onChange={(e) => setBcpCci(e.target.value)}
              inputMode="numeric"
              placeholder="CCI (opcional)"
              aria-label="CCI de la cuenta BCP"
              className="rounded-xl border border-[#E3E3E3] px-3 py-2 text-sm outline-none focus:border-[#6D28D9]"
            />
            <input
              value={bcpTitular}
              onChange={(e) => setBcpTitular(e.target.value)}
              placeholder="Titular de la cuenta"
              aria-label="Titular de la cuenta BCP"
              className="rounded-xl border border-[#E3E3E3] px-3 py-2 text-sm outline-none focus:border-[#6D28D9]"
            />
          </div>
          {bcpMensaje && <p className="text-xs text-red-700">{bcpMensaje}</p>}
          <div className="flex gap-2">
            <button type="submit" className="boton-morado flex-1 rounded-xl py-2 text-sm font-bold text-white">
              Guardar cuenta BCP
            </button>
            {bcpGuardado && (
              <button
                type="button"
                onClick={() => setEditandoBcp(false)}
                className="rounded-xl px-4 py-2 text-sm font-bold text-[#5A5A5A]"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}

      {/* Promoción de recarga */}
      {promo && !editandoPromo ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="min-w-0 text-sm text-amber-900">
            <p className="font-bold">🎁 Promoción activa: +{promo.porcentaje} % de saldo extra</p>
            <p className="text-xs">
              En recargas desde {soles(promo.desde)}
              {promo.hasta ? ` · hasta el ${fmtFecha(promo.hasta, { day: "numeric", month: "long" })}` : " · sin fecha de fin"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => guardarPromo(null, true)}
            className="shrink-0 rounded-xl bg-white px-3 py-2 text-sm font-bold text-amber-900"
          >
            Apagar
          </button>
        </div>
      ) : editandoPromo ? (
        <form onSubmit={guardarPromo} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <div>
            <h2 className="font-bold">Nueva promoción de recarga</h2>
            <p className="text-xs text-[#5A5A5A]">
              Los dueños la ven en su pantalla de recarga. El bono se suma solo cuando apruebas la recarga.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[#5A5A5A]">Saldo extra (%)</span>
              <input
                value={promoPct}
                onChange={(e) => setPromoPct(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                className="rounded-xl border border-[#E3E3E3] px-3 py-2 outline-none focus:border-[#6D28D9]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[#5A5A5A]">Desde (S/)</span>
              <input
                value={promoDesde}
                onChange={(e) => setPromoDesde(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                className="rounded-xl border border-[#E3E3E3] px-3 py-2 outline-none focus:border-[#6D28D9]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[#5A5A5A]">Hasta (opcional)</span>
              <input
                type="date"
                value={promoHasta}
                onChange={(e) => setPromoHasta(e.target.value)}
                className="rounded-xl border border-[#E3E3E3] px-2 py-2 outline-none focus:border-[#6D28D9]"
              />
            </label>
          </div>
          {Number(promoPct) > 0 && Number(promoDesde) >= 10 && (
            <p className="rounded-xl bg-[#F4F4F4] p-3 text-xs text-[#5A5A5A]">
              Ejemplo: quien recargue {soles(Number(promoDesde))} recibirá{" "}
              <strong>{soles(Number(promoDesde) + (Number(promoDesde) * Number(promoPct)) / 100)}</strong> de saldo.
            </p>
          )}
          {promoMensaje && <p className="text-xs text-red-700">{promoMensaje}</p>}
          <div className="flex gap-2">
            <button type="submit" className="boton-morado flex-1 rounded-xl py-2 text-sm font-bold text-white">
              Activar promoción
            </button>
            <button
              type="button"
              onClick={() => setEditandoPromo(false)}
              className="rounded-xl px-4 py-2 text-sm font-bold text-[#5A5A5A]"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setEditandoPromo(true)}
          className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 text-left shadow-sm hover:bg-[#FAFAFA]"
        >
          <span>
            <span className="block font-bold">🎁 Lanzar una promoción de recarga</span>
            <span className="block text-xs text-[#5A5A5A]">Ahora no hay ninguna. Ej.: +10 % de saldo en recargas desde S/ 50.</span>
          </span>
          <span className="shrink-0 text-[#C4B5FD]" aria-hidden="true">
            ›
          </span>
        </button>
      )}

      {/* Recarga al instante: límites */}
      <form onSubmit={guardarLimites} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div>
          <h2 className="font-bold">⚡ Recarga al instante</h2>
          <p className="text-xs text-[#5A5A5A]">
            Las recargas de hasta este monto se suman sin esperarte; luego las verificas. Pon 0 para apagarlo.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[#5A5A5A]">Hasta (S/ por recarga)</span>
            <input
              value={autoHasta}
              onChange={(e) => setAutoHasta(e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              className="rounded-xl border border-[#E3E3E3] px-3 py-2 outline-none focus:border-[#6D28D9]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[#5A5A5A]">Máximo al día por dueño (S/)</span>
            <input
              value={autoPorDia}
              onChange={(e) => setAutoPorDia(e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              className="rounded-xl border border-[#E3E3E3] px-3 py-2 outline-none focus:border-[#6D28D9]"
            />
          </label>
        </div>
        {limitesMensaje && <p className="text-xs text-[#5A5A5A]">{limitesMensaje}</p>}
        <button type="submit" className="self-start rounded-xl border border-[#6D28D9] px-4 py-2 text-sm font-bold text-[#6D28D9]">
          Guardar límites
        </button>
      </form>

      {/* Por verificar: ya se sumaron al instante */}
      <section className="flex flex-col gap-2">
        <h2 className="font-bold">
          Por verificar{" "}
          {porVerificar.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 text-sm text-amber-800">{porVerificar.length}</span>
          )}
        </h2>
        <p className="text-xs text-[#5A5A5A]">
          Ya se sumaron al saldo del dueño. Búscalas en tu Yape o BCP: deben venir del <strong>nombre</strong> y el{" "}
          <strong>número</strong> del dueño. Si el aviso del banco llega, se verifican solas.
        </p>
        {porVerificar.length === 0 ? (
          <p className="rounded-2xl bg-white p-4 text-sm text-[#5A5A5A] shadow-sm">Nada por verificar.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {porVerificar.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
                <div className="text-sm">
                  <p className="text-xl font-extrabold">{soles(Number(r.monto))}</p>
                  <p>
                    <EtiquetaMedio medio={r.medio} /> Operación <strong className="font-mono">{r.operacion}</strong>
                    {r.codigo_seguridad && (
                      <>
                        {" "}
                        · código <strong className="font-mono">{r.codigo_seguridad}</strong>
                      </>
                    )}
                  </p>
                  <DebeVenirDe r={r} />
                  <p className="text-xs text-[#5A5A5A]">{fecha(r.created_at)}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={ocupado === r.id}
                    onClick={() => verificar(r, true)}
                    className="flex-1 rounded-xl bg-[#0F7A55] py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    ✓ Llegó
                  </button>
                  <button
                    type="button"
                    disabled={ocupado === r.id}
                    onClick={() => verificar(r, false)}
                    className="flex-1 rounded-xl border border-red-200 py-2 text-sm font-bold text-red-700 disabled:opacity-50"
                  >
                    ✗ No llegó · Anular
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Por aprobar */}
      <section className="flex flex-col gap-2">
        <h2 className="font-bold">
          Por aprobar {pendientes.length > 0 && <span className="rounded-full bg-amber-100 px-2 text-sm text-amber-800">{pendientes.length}</span>}
        </h2>
        <p className="text-xs text-[#5A5A5A]">
          Son más grandes que el límite al instante. Busca en tu <strong>Yape</strong> o <strong>BCP</strong> un pago con ese{" "}
          <strong>monto</strong> y <strong>número de operación</strong>, del <strong>nombre y número del dueño</strong>.
        </p>
        {pendientes.length === 0 ? (
          <p className="rounded-2xl bg-white p-4 text-sm text-[#5A5A5A] shadow-sm">No hay recargas por revisar.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pendientes.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 text-sm">
                    <p className="text-xl font-extrabold">
                      {soles(Number(r.monto))}
                      {bonoDe(r) > 0 && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 align-middle text-xs font-bold text-amber-800">
                          + {soles(bonoDe(r))} de bono
                        </span>
                      )}
                    </p>
                    <p>
                      <span
                        className={`mr-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          r.medio === "bcp" ? "bg-[#E0ECFF] text-[#003A8C]" : "bg-[#EDE9FE] text-[#6D28D9]"
                        }`}
                      >
                        {r.medio === "bcp" ? "BCP" : "Yape"}
                      </span>
                      Operación <strong className="font-mono">{r.operacion}</strong>
                    </p>
                    {r.codigo_seguridad && (
                      <p className="text-xs">
                        Código de Yape <strong className="font-mono">{r.codigo_seguridad}</strong>
                      </p>
                    )}
                    <DebeVenirDe r={r} />
                    <p className="text-xs text-[#5A5A5A]">
                      {fecha(r.created_at)} · saldo actual {soles(Number(r.saldo))}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={ocupado === r.id}
                    onClick={() => revisar(r, true)}
                    className="flex-1 rounded-xl bg-[#0F7A55] py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    ✓ Me llegó · Aprobar
                  </button>
                  <button
                    type="button"
                    disabled={ocupado === r.id}
                    onClick={() => revisar(r, false)}
                    className="flex-1 rounded-xl border border-red-200 py-2 text-sm font-bold text-red-700 disabled:opacity-50"
                  >
                    No me llegó
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Avisos del banco */}
      <section className="flex flex-col gap-2">
        <h2 className="font-bold">📩 Avisos del banco</h2>
        <div className="flex flex-col gap-2 rounded-2xl bg-white p-4 text-sm shadow-sm">
          <p className="text-xs text-[#5A5A5A]">
            Un script en tu Gmail lee las alertas del BCP y confirma solas las recargas que coinciden (monto, nombre y número
            del dueño). Instrucciones en <span className="font-mono">docs/avisos-banco.md</span>.
          </p>
          {claveNueva ? (
            <div className="flex flex-col gap-2 rounded-xl bg-amber-50 p-3">
              <p className="text-xs font-bold text-amber-900">
                Copia esta clave ahora y pégala en tu script de Google. No se volverá a mostrar.
              </p>
              <p className="break-all font-mono text-xs">{claveNueva}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(claveNueva).catch(() => {})}
                  className="rounded-lg bg-white px-3 py-1 text-xs font-bold text-amber-900"
                >
                  Copiar
                </button>
                <button type="button" onClick={() => setClaveNueva(null)} className="rounded-lg px-3 py-1 text-xs font-bold text-[#5A5A5A]">
                  Ya la copié
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={generarClave}
              className="self-start rounded-xl border border-[#6D28D9] px-4 py-2 text-sm font-bold text-[#6D28D9]"
            >
              Generar clave para el script
            </button>
          )}
        </div>
        {avisos.length > 0 && (
          <ul className="divide-y divide-[#E3E3E3] overflow-hidden rounded-2xl bg-white shadow-sm">
            {avisos.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">
                    <EtiquetaMedio medio={a.medio} /> {soles(Number(a.monto))} · {a.nombre ?? "sin nombre"}
                  </span>
                  <span className="block truncate text-xs text-[#5A5A5A]">
                    {a.operacion ? `op. ${a.operacion} · ` : ""}
                    {a.celular ? `cel. ${a.celular} · ` : ""}
                    {fecha(a.fecha ?? a.created_at)}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    a.resultado === "confirmada" ? "bg-[#DCF5EA] text-[#0F7A55]" : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {a.resultado === "confirmada" ? "Confirmó una recarga" : "Sin coincidencia"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Saldo de cada dueño */}
      <section className="flex flex-col gap-2">
        <h2 className="font-bold">Saldo de los dueños</h2>
        {saldos.length === 0 ? (
          <p className="rounded-2xl bg-white p-4 text-sm text-[#5A5A5A] shadow-sm">Aún no hay dueños.</p>
        ) : (
          <ul className="divide-y divide-[#E3E3E3] overflow-hidden rounded-2xl bg-white shadow-sm">
            {saldos.map((s) => (
              <li key={s.dueno_id} className="flex flex-col gap-2 p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{s.dueno_nombre ?? "Sin nombre"}</span>
                    <span className="block truncate text-xs text-[#5A5A5A]">{s.dueno_correo}</span>
                    <span className="mt-1 flex flex-wrap gap-1 text-[11px]">
                      <span className="rounded-full bg-[#F4F4F4] px-2 py-0.5">
                        {s.cobradas_30_dias} cobradas en 30 días
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 ${
                          Number(s.rechazos_30_dias) >= 3 ? "bg-red-50 font-bold text-red-700" : "bg-[#F4F4F4]"
                        }`}
                        title="Veces que marcó «No me llegó» en 30 días. Muchas pueden significar que cobra por fuera de la app."
                      >
                        {s.rechazos_30_dias} «No me llegó»{Number(s.rechazos_30_dias) >= 3 ? " ⚠️" : ""}
                      </span>
                      {s.recarga_auto_bloqueada && (
                        <button
                          type="button"
                          onClick={() => permitirAuto(s.dueno_id, true)}
                          className="rounded-full bg-red-50 px-2 py-0.5 font-bold text-red-700"
                          title="Avisó un pago que no llegó. Toca para volver a permitirle recargas al instante."
                        >
                          Sin recarga al instante · Permitir
                        </button>
                      )}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className={`font-extrabold ${Number(s.saldo) < 1 ? "text-red-700" : ""}`}>{soles(Number(s.saldo))}</span>
                    <button
                      type="button"
                      onClick={() => setAjuste({ dueno: s.dueno_id, monto: "", nota: "" })}
                      className="rounded-lg border border-[#E3E3E3] px-2 py-1 text-xs font-bold"
                    >
                      Ajustar
                    </button>
                  </span>
                </div>
                {ajuste?.dueno === s.dueno_id && (
                  <form onSubmit={guardarAjuste} className="flex flex-col gap-2 rounded-xl bg-[#F4F4F4] p-3 sm:flex-row">
                    <input
                      value={ajuste.monto}
                      onChange={(e) => setAjuste({ ...ajuste, monto: e.target.value })}
                      inputMode="decimal"
                      placeholder="+5 o -2.50"
                      aria-label="Monto del ajuste"
                      className="w-28 rounded-lg border border-[#E3E3E3] px-2 py-1"
                    />
                    <input
                      value={ajuste.nota}
                      onChange={(e) => setAjuste({ ...ajuste, nota: e.target.value })}
                      placeholder="Motivo (lo ve el dueño)"
                      aria-label="Motivo del ajuste"
                      className="flex-1 rounded-lg border border-[#E3E3E3] px-2 py-1"
                    />
                    <div className="flex gap-2">
                      <button type="submit" className="rounded-lg bg-[#6D28D9] px-3 py-1 font-bold text-white">
                        Guardar
                      </button>
                      <button type="button" onClick={() => setAjuste(null)} className="rounded-lg px-3 py-1 font-bold text-[#5A5A5A]">
                        Cancelar
                      </button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Ya revisadas */}
      {revisadas.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-bold">Revisadas</h2>
          <ul className="divide-y divide-[#E3E3E3] overflow-hidden rounded-2xl bg-white shadow-sm">
            {revisadas.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">
                    {soles(Number(r.monto))} · {r.dueno_nombre ?? r.dueno_correo}
                  </span>
                  <span className="block truncate text-xs text-[#5A5A5A]">
                    <EtiquetaMedio medio={r.medio} /> op. {r.operacion} · {fecha(r.created_at)}
                    {r.nota ? ` · ${r.nota}` : ""}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    r.estado === "aprobada" ? "bg-[#DCF5EA] text-[#0F7A55]" : "bg-red-50 text-red-700"
                  }`}
                >
                  {r.verificacion === "fallida"
                    ? "Anulada"
                    : r.verificada_por?.startsWith("aviso_")
                      ? "Confirmada por el banco"
                      : r.estado === "aprobada"
                        ? "Aprobada"
                        : "Rechazada"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
