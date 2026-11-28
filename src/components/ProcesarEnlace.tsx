"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { confiarDispositivo } from "@/lib/dispositivo";
import { borrarEspera, describirNavegador, leerEspera, type EstadoAprobacion } from "@/lib/aprobacion";
import { Aviso, Boton } from "@/components/ui";
import CampoTexto from "@/components/CampoTexto";

const ERRORES: Record<string, string> = {
  otp_expired: "Este enlace ya venció o ya se usó. Pide uno nuevo desde la app.",
  access_denied: "Este enlace ya no es válido. Pide uno nuevo desde la app.",
  email_not_confirmed: "Tu correo todavía no está confirmado. Abre el último correo que te enviamos.",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Solicitud = {
  id: string;
  motivo: string;
  ip: string | null;
  agente: string | null;
  creada: string;
  estado: EstadoAprobacion;
};

type Pantalla =
  | { tipo: "cargando" }
  | { tipo: "error"; mensaje: string }
  /** Ingreso desde otro dispositivo: ¿Eres tú? */
  | { tipo: "pregunta"; solicitud: Solicitud }
  | { tipo: "aprobada" }
  | { tipo: "rechazada" }
  /** Cuenta confirmada desde otro dispositivo */
  | { tipo: "registro" }
  /** Recuperar la cuenta: crear la contraseña nueva */
  | { tipo: "nuevaClave"; solicitud: Solicitud | null; mismo: boolean }
  | { tipo: "claveCambiada" }
  | { tipo: "recuperacionAnulada" }
  /** La solicitud ya no sirve (venció, se anuló o ya se usó): no se entra */
  | { tipo: "inactiva"; mensaje: string; volverA: string; textoVolver: string };

function haceCuanto(fecha: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(fecha).getTime()) / 60_000));
  return min < 1 ? "hace un momento" : min === 1 ? "hace 1 minuto" : `hace ${min} minutos`;
}

function traducirClave(msg: string): string {
  if (/should be different|same.*password|different from the old/i.test(msg)) return "Usa una contraseña distinta a la anterior.";
  if (/pwned|leaked|compromised|breach/i.test(msg)) return "Esa contraseña apareció en filtraciones de datos. Elige otra.";
  if (/session|jwt|expired|reauth/i.test(msg)) return "El enlace venció. Pide otro desde la app.";
  if (/weak|at least|characters|password/i.test(msg)) return "La contraseña debe tener al menos 8 caracteres.";
  return "No pudimos guardar la contraseña. Inténtalo de nuevo.";
}

const INACTIVA: Record<string, string> = {
  vencida: "Este enlace venció (dura 10 minutos) o se pidió uno más nuevo.",
  rechazada: "Esta solicitud ya se anuló.",
  usada: "Este enlace ya se usó.",
  aprobada: "Este enlace ya se usó.",
};

/** Datos del dispositivo que pidió el enlace. */
function DatosSolicitud({ s }: { s: Solicitud }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-superficie-suave p-4 text-sm">
      <dt className="text-tinta-suave">Dispositivo</dt>
      <dd className="font-bold text-tinta">{describirNavegador(s.agente)}</dd>
      <dt className="text-tinta-suave">Conexión (IP)</dt>
      <dd className="font-bold text-tinta">{s.ip ?? "Desconocida"}</dd>
      <dt className="text-tinta-suave">Cuándo</dt>
      <dd className="font-bold text-tinta">{haceCuanto(s.creada)}</dd>
    </dl>
  );
}

/**
 * Recibe el enlace del correo (#access_token=…&refresh_token=… en la dirección) e inicia la sesión.
 *
 * · Abierto en el mismo navegador que lo pidió: entra directo y este dispositivo queda de confianza.
 * · Abierto en otro dispositivo (por ejemplo, el celular):
 *   – crear cuenta: avisa que quedó confirmada; la otra pantalla entra sola;
 *   – dispositivo nuevo: pregunta "¿Eres tú?" con el navegador e IP de quien pidió entrar.
 * · Recuperar la cuenta: pide la contraseña nueva; la otra pantalla entra con ella.
 * Cada enlace dura 10 minutos (migración 025).
 */
export default function ProcesarEnlace() {
  const [pantalla, setPantalla] = useState<Pantalla>({ tipo: "cargando" });
  const [ocupado, setOcupado] = useState(false);
  const [destino, setDestino] = useState("/");
  const [nuevaClave, setNuevaClave] = useState("");
  const [errorClave, setErrorClave] = useState<string | null>(null);
  const hecho = useRef(false);

  const error = (mensaje: string) => setPantalla({ tipo: "error", mensaje });

  async function entrarAqui(dest = destino) {
    setOcupado(true);
    // Entró con el enlace de su correo: este dispositivo queda de confianza (migración 018)
    await confiarDispositivo();
    borrarEspera();
    window.location.assign(`/auth/destino?next=${encodeURIComponent(dest)}`);
  }

  useEffect(() => {
    if (hecho.current) return;
    hecho.current = true;

    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const siguiente = query.get("next");
    const dest = siguiente?.startsWith("/") && !siguiente.startsWith("//") ? siguiente : "/";
    setDestino(dest);
    const solicitud = query.get("solicitud");
    const esRegistro = query.get("registro") === "1";
    const esRecuperacion = query.get("recuperar") === "1" || hash.get("type") === "recovery";

    const codigoError = hash.get("error_code") ?? query.get("error_code") ?? hash.get("error") ?? query.get("error");
    if (codigoError) {
      return error(ERRORES[codigoError] ?? hash.get("error_description")?.replace(/\+/g, " ") ?? "No pudimos usar este enlace.");
    }

    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");

    // Enlace antiguo (con ?code=): lo procesa el servidor
    if (!accessToken && query.get("code")) {
      window.location.replace(`/auth/callback?code=${encodeURIComponent(query.get("code")!)}&next=${encodeURIComponent(dest)}`);
      return;
    }

    if (!accessToken || !refreshToken) return error("Este enlace está incompleto. Vuelve a pedirlo desde la app.");

    (async () => {
      const supabase = supabaseNavegador();
      if (!supabase) return error("La app no está conectada a la base de datos.");
      const { data, error: errSesion } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      if (errSesion) return error("Este enlace ya venció o ya se usó. Pide uno nuevo desde la app.");
      // Quita la sesión de la dirección para que no quede en el historial
      window.history.replaceState(null, "", window.location.pathname + window.location.search);

      // ¿Este navegador es el que pidió el enlace?
      const correoSesion = data.user?.email?.toLowerCase();
      const espera = leerEspera();
      const mismoNavegador =
        !!espera && espera.correo === correoSesion && (!solicitud || espera.solicitud === solicitud);

      // Datos de la solicitud (solo el dueño de la cuenta puede verlos)
      let fila: Solicitud | null = null;
      if (solicitud && UUID.test(solicitud)) {
        const { data: filas } = await supabase.rpc("ver_aprobacion", { p_solicitud: solicitud });
        const f = (Array.isArray(filas) ? filas[0] : null) as Omit<Solicitud, "id"> | null;
        if (f) fila = { id: solicitud, ...f };
      }

      // Solicitud que ya no sirve (pasaron los 10 minutos, se anuló o ya se usó): no se entra
      if (fila && fila.estado !== "pendiente" && !(fila.estado === "aprobada" && fila.motivo === "dispositivo")) {
        await supabase.auth.signOut({ scope: "local" });
        const recuperar = fila.motivo === "recuperacion";
        return setPantalla({
          tipo: "inactiva",
          mensaje: INACTIVA[fila.estado] ?? "Este enlace ya no está activo.",
          volverA: recuperar ? `/recuperar?next=${encodeURIComponent(dest)}` : `/ingresar?next=${encodeURIComponent(dest)}`,
          textoVolver: recuperar ? "Pedir otro enlace" : "Ir a Ingresar",
        });
      }

      if (esRecuperacion) return setPantalla({ tipo: "nuevaClave", solicitud: fila, mismo: mismoNavegador });

      if (solicitud && UUID.test(solicitud)) {
        if (mismoNavegador) {
          // Es el mismo dispositivo que pidió entrar: se aprueba y entra
          await supabase.rpc("aprobar_ingreso", { p_solicitud: solicitud, p_aprobar: true, p_este_dispositivo: true });
          return entrarAqui(dest);
        }
        // Sin la migración 025 o solicitud de otra cuenta: se entra como antes
        if (!fila) return entrarAqui(dest);
        return setPantalla({ tipo: "pregunta", solicitud: fila });
      }

      if (esRegistro && !mismoNavegador) return setPantalla({ tipo: "registro" });
      return entrarAqui(dest);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function responder(solicitud: Solicitud, aprobar: boolean) {
    const supabase = supabaseNavegador();
    if (!supabase) return;
    setOcupado(true);
    const { data, error: errAprobar } = await supabase.rpc("aprobar_ingreso", {
      p_solicitud: solicitud.id,
      p_aprobar: aprobar,
      p_este_dispositivo: false,
    });
    setOcupado(false);
    if (errAprobar)
      return error(
        /requiere_codigo/.test(errAprobar.message)
          ? "Pasó mucho tiempo desde que abriste el enlace. Vuelve a ingresar en el otro dispositivo para recibir uno nuevo."
          : "No pudimos guardar tu respuesta. Inténtalo de nuevo."
      );
    const estado = data as EstadoAprobacion;
    if (estado === "aprobada" || estado === "usada") return setPantalla({ tipo: "aprobada" });
    if (estado === "rechazada") return setPantalla({ tipo: "rechazada" });
    setPantalla({ tipo: "pregunta", solicitud: { ...solicitud, estado } });
  }

  // Recuperar la cuenta: guarda la contraseña nueva y avisa a la pantalla que espera
  async function guardarClave(e: React.FormEvent, p: Extract<Pantalla, { tipo: "nuevaClave" }>) {
    e.preventDefault();
    const supabase = supabaseNavegador();
    if (!supabase) return;
    if (nuevaClave.length < 8) return setErrorClave("La contraseña debe tener al menos 8 caracteres.");
    setOcupado(true);
    setErrorClave(null);
    const { error: errClave } = await supabase.auth.updateUser({ password: nuevaClave });
    if (errClave) {
      setOcupado(false);
      return setErrorClave(traducirClave(errClave.message));
    }
    // Se cierran las sesiones abiertas en otros dispositivos
    await supabase.auth.signOut({ scope: "others" });
    if (p.solicitud) {
      await supabase.rpc("aprobar_ingreso", { p_solicitud: p.solicitud.id, p_aprobar: true, p_este_dispositivo: p.mismo });
    }
    if (p.mismo || !p.solicitud) return entrarAqui();
    setOcupado(false);
    setPantalla({ tipo: "claveCambiada" });
  }

  async function noPediEsto(s: Solicitud) {
    const supabase = supabaseNavegador();
    if (!supabase) return;
    setOcupado(true);
    await supabase.rpc("aprobar_ingreso", { p_solicitud: s.id, p_aprobar: false });
    await supabase.auth.signOut({ scope: "local" });
    setOcupado(false);
    setPantalla({ tipo: "recuperacionAnulada" });
  }

  const seguirAqui = (
    <Boton variante="secundario" ancho cargando={ocupado} onClick={() => entrarAqui()}>
      Seguir en este dispositivo
    </Boton>
  );

  if (pantalla.tipo === "error") {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-2xl" aria-hidden="true">
          ⚠️
        </span>
        <p className="text-sm text-[#4A4A4A]">{pantalla.mensaje}</p>
        <p className="text-xs text-[#8A968F]">
          Si estabas creando tu cuenta, es probable que ya haya quedado confirmada: prueba entrar con tu correo y
          contraseña.
        </p>
        <Link href="/ingresar" className="boton-morado w-full rounded-xl py-3 font-bold text-white">
          Ir a Ingresar
        </Link>
      </div>
    );
  }

  if (pantalla.tipo === "inactiva") {
    return (
      <div className="flex flex-col gap-4">
        <Aviso tono="aviso" titulo="Este enlace ya no sirve">
          {pantalla.mensaje} Pide uno nuevo desde la app.
        </Aviso>
        <Boton ancho href={pantalla.volverA}>
          {pantalla.textoVolver}
        </Boton>
      </div>
    );
  }

  if (pantalla.tipo === "registro") {
    return (
      <div className="flex flex-col gap-4">
        <Aviso tono="exito" titulo="¡Tu cuenta quedó confirmada!">
          Si te registraste en otra pantalla (por ejemplo, en la computadora), vuelve a ella: entrará sola en unos
          segundos.
        </Aviso>
        {seguirAqui}
      </div>
    );
  }

  if (pantalla.tipo === "aprobada") {
    return (
      <div className="flex flex-col gap-4">
        <Aviso tono="exito" titulo="Listo, aprobaste el ingreso">
          Vuelve a la otra pantalla: entrará sola en unos segundos.
        </Aviso>
        {seguirAqui}
      </div>
    );
  }

  if (pantalla.tipo === "rechazada") {
    return (
      <div className="flex flex-col gap-4">
        <Aviso tono="error" titulo="Bloqueamos ese ingreso">
          Nadie entró. Ojo: alguien conoce tu contraseña. Cámbiala desde “¿Olvidaste tu contraseña?” en Ingresar.
        </Aviso>
        {seguirAqui}
      </div>
    );
  }

  if (pantalla.tipo === "claveCambiada") {
    return (
      <div className="flex flex-col gap-4">
        <Aviso tono="exito" titulo="Listo, tu contraseña se cambió">
          Vuelve a la otra pantalla y entra con tu contraseña nueva. Cerramos la sesión en tus otros dispositivos.
        </Aviso>
        {seguirAqui}
      </div>
    );
  }

  if (pantalla.tipo === "recuperacionAnulada") {
    return (
      <div className="flex flex-col gap-4">
        <Aviso tono="info" titulo="Listo, no cambiamos nada">
          Tu contraseña sigue igual. Alguien escribió tu correo en “Recuperar cuenta”, pero sin este enlace no puede
          hacer nada.
        </Aviso>
        <Boton ancho href="/">
          Ir a EasyFut
        </Boton>
      </div>
    );
  }

  if (pantalla.tipo === "nuevaClave") {
    const p = pantalla;
    const deOtroDispositivo = !p.mismo && p.solicitud;
    return (
      <form onSubmit={(e) => guardarClave(e, p)} className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-marca-tinte text-2xl" aria-hidden="true">
            🔑
          </span>
          <h2 className="text-lg font-bold">Crea tu contraseña nueva</h2>
          {deOtroDispositivo && <p className="text-sm text-tinta-suave">Pediste recuperar tu cuenta desde:</p>}
        </div>
        {deOtroDispositivo && p.solicitud && <DatosSolicitud s={p.solicitud} />}
        <CampoTexto
          etiqueta="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          value={nuevaClave}
          onChange={(e) => setNuevaClave(e.target.value)}
          ayuda="Mínimo 8 caracteres. Mejor si mezclas letras y números."
          minLength={8}
          required
          autoFocus
        />
        {errorClave && <Aviso tono="error">{errorClave}</Aviso>}
        <Boton type="submit" ancho tamano="lg" cargando={ocupado}>
          Guardar contraseña
        </Boton>
        {deOtroDispositivo && p.solicitud && (
          <Boton variante="fantasma" ancho disabled={ocupado} onClick={() => noPediEsto(p.solicitud!)}>
            No pedí esto
          </Boton>
        )}
      </form>
    );
  }

  if (pantalla.tipo === "pregunta") {
    const s = pantalla.solicitud;
    if (s.estado !== "pendiente") {
      const textos: Record<string, string> = {
        aprobada: "Este ingreso ya estaba aprobado.",
        usada: "Este ingreso ya se completó.",
        rechazada: "Este ingreso ya estaba rechazado.",
        vencida: "Este enlace venció (dura 10 minutos) o se pidió uno más nuevo. Si eras tú, vuelve a ingresar en el otro dispositivo.",
      };
      return (
        <div className="flex flex-col gap-4">
          <Aviso tono="info">{textos[s.estado] ?? "Este enlace ya no está activo."}</Aviso>
          {seguirAqui}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-marca-tinte text-2xl" aria-hidden="true">
            🔐
          </span>
          <h2 className="text-lg font-bold">¿Eres tú quien quiere entrar?</h2>
          <p className="text-sm text-tinta-suave">Alguien escribió tu contraseña y quiere entrar a tu cuenta desde:</p>
        </div>
        <DatosSolicitud s={s} />
        <Boton variante="exito" ancho cargando={ocupado} onClick={() => responder(s, true)}>
          Sí, soy yo
        </Boton>
        <Boton variante="peligro" ancho disabled={ocupado} onClick={() => responder(s, false)}>
          No fui yo
        </Boton>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center" aria-busy="true">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-[#EDE9FE] border-t-[#6D28D9]" aria-hidden="true" />
      <p className="font-bold">Entrando a EasyFut…</p>
    </div>
  );
}
