"use client";

import { useState } from "react";
import { Aviso, Boton, Campo, Tarjeta, cx } from "@/components/ui";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { soles } from "@/lib/horario";
import { DatoCopiable } from "./DatoCopiable";
import { calculadora, formatoCuenta, type Medio, type Saldo } from "./tipos";

const MONTOS = [20, 50, 100];
const MINIMO = 1;
const MAXIMO = 500;

const ERRORES: Record<string, string> = {
  monto_invalido: "El monto debe ser de S/ 1 a S/ 500.",
  operacion_invalida: "Escribe el número de operación tal como aparece en tu Yape o en tu constancia del BCP.",
  medio_no_disponible: "Ese medio de pago no está disponible ahora. Elige el otro.",
  operacion_repetida: "Ese número de operación ya se usó en otra recarga.",
  demasiadas_pendientes: "Tienes 3 recargas esperando revisión. Espera a que las aprobemos.",
  sin_permiso: "Solo los dueños pueden recargar.",
};

/** Paso a paso para recargar: monto → medio → datos para pagar → número de operación. */
export function FormularioRecarga({ saldo, alAvisar }: { saldo: Saldo; alAvisar: () => void }) {
  const [monto, setMonto] = useState(50);
  const [otro, setOtro] = useState("");
  const [operacion, setOperacion] = useState("");
  const [medioElegido, setMedio] = useState<Medio>("yape");
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tono: "exito" | "error"; texto: string } | null>(null);

  const { bonoPct, bonoDe, reservasDe } = calculadora(saldo);
  // Si EasyFut aún no tiene Yape pero sí BCP, se usa BCP
  const medio: Medio = medioElegido === "yape" && !saldo.yape_numero && saldo.bcp_cuenta ? "bcp" : medioElegido;

  const montoFinal = otro ? Number(otro.replace(",", ".")) : monto;
  const montoValido = Number.isFinite(montoFinal) && montoFinal >= MINIMO && montoFinal <= MAXIMO;
  const operacionLimpia = operacion.replace(/[\s-]/g, "").toUpperCase();
  const operacionValida = /^[0-9A-Z]{4,20}$/.test(operacionLimpia);

  if (!saldo.yape_numero && !saldo.bcp_cuenta) {
    return (
      <Tarjeta titulo="Recargar saldo">
        <Aviso>Las recargas aún no están disponibles. Escríbenos a easyfutinquiries@gmail.com.</Aviso>
      </Tarjeta>
    );
  }

  async function avisar(e: React.FormEvent) {
    e.preventDefault();
    const supabase = supabaseNavegador();
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
      return setMensaje({ tono: "error", texto: clave ? ERRORES[clave] : "No se pudo enviar. Inténtalo de nuevo." });
    }
    setOperacion("");
    setOtro("");
    setMensaje({
      tono: "exito",
      texto: `¡Listo! Revisaremos tu ${medio === "bcp" ? "transferencia" : "Yape"} y sumaremos el saldo. Normalmente toma unas horas.`,
    });
    alAvisar();
  }

  const medios = [
    { clave: "yape" as const, texto: "Yape", detalle: "Al instante", activo: !!saldo.yape_numero },
    { clave: "bcp" as const, texto: "Transferencia BCP", detalle: "O desde otro banco (CCI)", activo: !!saldo.bcp_cuenta },
  ].filter((m) => m.activo);

  return (
    <Tarjeta titulo="Recargar saldo" descripcion={`Desde ${soles(MINIMO)} hasta ${soles(MAXIMO)}`}>
      <form onSubmit={avisar} className="flex flex-col gap-5">
        {/* 1. Monto */}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-bold">1. Elige cuánto recargar</legend>
          <div className="flex flex-wrap gap-2">
            {MONTOS.map((m) => {
              const activo = !otro && monto === m;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => {
                    setMonto(m);
                    setOtro("");
                  }}
                  className={cx(
                    "rounded-xl border px-4 py-2 text-sm font-bold transition active:scale-[0.98]",
                    activo ? "border-marca bg-marca text-white" : "border-borde bg-superficie text-tinta hover:border-marca"
                  )}
                >
                  {soles(m)} <span className="font-medium opacity-80">· {reservasDe(m)} reservas</span>
                  {bonoDe(m) > 0 && (
                    <span className="ml-1 rounded-full bg-amber-400 px-1.5 text-[11px] text-amber-950">+{bonoPct} %</span>
                  )}
                </button>
              );
            })}
            <input
              value={otro}
              onChange={(e) => setOtro(e.target.value.replace(/[^\d.,]/g, ""))}
              inputMode="decimal"
              placeholder="Otro monto"
              aria-label="Otro monto en soles"
              className="w-32 rounded-xl border border-borde px-3 py-2 text-sm outline-none focus:border-marca focus:ring-2 focus:ring-marca/20"
            />
          </div>
          {otro && !montoValido && <p className="text-xs text-red-700">De S/ 1 a S/ 500.</p>}
          {montoValido && (
            <p className="text-sm text-tinta-suave">
              Recibes <strong className="text-tinta">{soles(montoFinal + bonoDe(montoFinal))}</strong> de saldo ={" "}
              {reservasDe(montoFinal)} reservas
              {bonoDe(montoFinal) > 0 && <span className="text-amber-800"> (incluye {soles(bonoDe(montoFinal))} de bono)</span>}
            </p>
          )}
        </fieldset>

        {/* 2. Medio */}
        <fieldset>
          <legend className="mb-2 text-sm font-bold">2. Elige cómo pagar</legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Medio de pago">
            {medios.map((m) => (
              <button
                key={m.clave}
                type="button"
                role="radio"
                aria-checked={medio === m.clave}
                onClick={() => setMedio(m.clave)}
                className={cx(
                  "rounded-xl border p-3 text-left transition",
                  medio === m.clave ? "border-marca bg-marca-tinte" : "border-borde bg-superficie hover:border-marca"
                )}
              >
                <span className="block font-bold">{m.texto}</span>
                <span className="block text-xs text-tinta-suave">{m.detalle}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {/* 3. A dónde pagar */}
        <Tarjeta tono="marca" como="div">
          {medio === "yape" && saldo.yape_numero ? (
            <>
              <p className="text-sm font-bold">3. Yapea {montoValido ? soles(montoFinal) : "el monto"} a EasyFut</p>
              <DatoCopiable
                grande
                mostrar={saldo.yape_numero.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3")}
                copiar={saldo.yape_numero}
              />
              {saldo.yape_titular && <p className="text-sm">A nombre de {saldo.yape_titular}</p>}
            </>
          ) : saldo.bcp_cuenta ? (
            <>
              <p className="text-sm font-bold">3. Transfiere {montoValido ? soles(montoFinal) : "el monto"} a EasyFut</p>
              <DatoCopiable etiqueta="Cuenta BCP (soles)" mostrar={formatoCuenta(saldo.bcp_cuenta)} copiar={saldo.bcp_cuenta} />
              {saldo.bcp_cci && (
                <DatoCopiable etiqueta="CCI (desde otros bancos)" mostrar={formatoCuenta(saldo.bcp_cci)} copiar={saldo.bcp_cci} />
              )}
              {saldo.bcp_titular && <p className="text-sm">A nombre de {saldo.bcp_titular}</p>}
            </>
          ) : null}
        </Tarjeta>

        {/* 4. Número de operación */}
        <Campo
          etiqueta="4. Escribe el número de operación"
          value={operacion}
          onChange={(e) => setOperacion(e.target.value)}
          placeholder={medio === "bcp" ? "Aparece en la constancia de tu transferencia" : "Lo ves en tu Yape, en el detalle del pago"}
          autoComplete="off"
          error={operacion && !operacionValida ? "Entre 4 y 20 letras o números." : undefined}
        />

        {mensaje && <Aviso tono={mensaje.tono}>{mensaje.texto}</Aviso>}

        <Boton type="submit" tamano="lg" ancho cargando={enviando} disabled={!montoValido || !operacionValida}>
          {enviando ? "Enviando…" : medio === "bcp" ? "Ya transferí · Avisar recarga" : "Ya yapeé · Avisar recarga"}
        </Boton>
        <p className="text-center text-xs text-tinta-suave">
          Revisamos cada pago a mano y sumamos el saldo cuando lo vemos. Las transferencias desde otros bancos pueden tardar
          más. Usa tu número de operación real: uno inventado se rechaza.
        </p>
      </form>
    </Tarjeta>
  );
}
