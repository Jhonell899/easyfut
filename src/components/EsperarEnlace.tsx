"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { confiarDispositivo, esConfiable, esperaParaEnviar, registrarEnvio } from "@/lib/dispositivo";
import { borrarEspera, estadoAprobacion, type TipoEnlace } from "@/lib/aprobacion";
import { Aviso, Boton } from "@/components/ui";
import CampoTexto from "@/components/CampoTexto";

// Cada enlace dura 10 minutos (migración 025)
const DIEZ_MIN = 10 * 60_000;

type Final = "rechazada" | "vencida" | "usada" | "entrar_a_mano" | "nueva_clave";

const ENLACE: Record<TipoEnlace, string> = {
  registro: "Confirm email address",
  dispositivo: "Log In",
  recuperacion: "Reset Password",
};

/**
 * "Revisa tu correo": espera a que la persona toque el enlace del correo (crear cuenta,
 * dispositivo nuevo o recuperar la cuenta), en este dispositivo o en otro (por ejemplo,
 * el celular), y entonces continúa sola.
 *
 * · En este navegador: otra pestaña abre el enlace y esta pantalla lo nota.
 * · En otro dispositivo: pregunta a la base cada pocos segundos con su `secreto`
 *   (migración 025). Al quedar aprobada, entra con la `clave` (si se dio) y deja
 *   este dispositivo de confianza. Al recuperar la cuenta, pide la contraseña nueva
 *   que se creó con el enlace y entra con ella, sin otro correo.
 */
export default function EsperarEnlace({
  correo,
  destino,
  tipo,
  secreto,
  clave,
  explicacion,
  errorInicial,
  reenviar,
  onVolver,
}: {
  correo: string;
  destino: string;
  /** registro = crear cuenta; dispositivo = entrar desde un dispositivo nuevo; recuperacion = olvidé mi contraseña */
  tipo: TipoEnlace;
  /** Secreto de la solicitud. Sin él, solo funciona abriendo el enlace en este navegador. */
  secreto?: string | null;
  /** Contraseña escrita en esta pantalla (solo en memoria), para entrar al aprobarse. */
  clave?: string;
  explicacion?: string;
  errorInicial?: string | null;
  /** Vuelve a mandar el correo. Devuelve un mensaje de error o null. */
  reenviar: () => Promise<string | null>;
  onVolver?: () => void;
}) {
  const [final, setFinal] = useState<Final | null>(null);
  const [entrando, setEntrando] = useState(false);
  const [pausado, setPausado] = useState(false);
  const [error, setError] = useState<string | null>(errorInicial ?? null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [espera, setEspera] = useState(0);
  const [reenviando, setReenviando] = useState(false);
  const [nuevaClave, setNuevaClave] = useState("");
  const ocupado = useRef(false);
  const terminado = useRef(false);
  const vueltasConSesion = useRef(0);

  const irAdentro = useCallback(() => {
    terminado.current = true;
    borrarEspera();
    window.location.assign(`/auth/destino?next=${encodeURIComponent(destino)}`);
  }, [destino]);

  const terminar = useCallback((estado: Final) => {
    terminado.current = true;
    setFinal(estado);
  }, []);

  // Aprobado: entra (con la contraseña si hace falta) y deja este dispositivo de confianza
  const continuar = useCallback(async () => {
    const supabase = supabaseNavegador();
    if (!supabase || ocupado.current || terminado.current) return;
    // Recuperar la cuenta: la contraseña nueva se creó con el enlace; se pide aquí
    if (tipo === "recuperacion" && !clave) return terminar("nueva_clave");
    ocupado.current = true;
    setEntrando(true);
    if (clave) {
      const { error } = await supabase.auth.signInWithPassword({ email: correo, password: clave });
      if (error) {
        ocupado.current = false;
        setEntrando(false);
        // El correo se acaba de confirmar: se vuelve a intentar en la siguiente vuelta
        if (/email not confirmed/i.test(error.message)) return;
        return terminar("entrar_a_mano");
      }
    }
    if (secreto) await confiarDispositivo(secreto);
    irAdentro();
  }, [tipo, clave, correo, secreto, irAdentro, terminar]);

  const revisar = useCallback(async () => {
    const supabase = supabaseNavegador();
    if (!supabase || ocupado.current || terminado.current) return;

    // ¿El enlace se abrió en otra pestaña de este navegador y ya entró?
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const mismaCuenta = session?.user.email?.toLowerCase() === correo.toLowerCase();
    if (mismaCuenta && (await esConfiable()) !== false) return irAdentro();
    // Aquí no había sesión (se entra con la contraseña): si apareció una, otra pestaña
    // abrió el enlace y está terminando. Se le dan unos segundos antes de seguir por aquí.
    if (mismaCuenta && clave && vueltasConSesion.current++ < 3) return;

    if (!secreto) return;
    const estado = await estadoAprobacion(supabase, secreto);
    if (estado === "aprobada") return continuar();
    if (estado === "usada") return mismaCuenta ? irAdentro() : terminar("usada");
    if (estado === "rechazada") return terminar("rechazada");
    if (estado === "vencida" || estado === "no_existe") return terminar("vencida");
  }, [correo, clave, secreto, continuar, irAdentro, terminar]);

  // Revisa cada 3 s (15 s si la pestaña está oculta) durante 10 minutos,
  // y al volver a esta pestaña o cuando otra pestaña inicia sesión.
  useEffect(() => {
    if (final || pausado) return;
    const supabase = supabaseNavegador();
    let vivo = true;
    let temporizador: ReturnType<typeof setTimeout>;
    const inicio = Date.now();

    const ciclo = async () => {
      if (!vivo) return;
      await revisar();
      if (!vivo || terminado.current) return;
      if (Date.now() - inicio > DIEZ_MIN) return setPausado(true);
      temporizador = setTimeout(ciclo, document.hidden ? 15_000 : 3_000);
    };
    temporizador = setTimeout(ciclo, 2_000);

    const alVolver = () => {
      if (!document.hidden) revisar();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    const suscripcion = supabase?.auth.onAuthStateChange((evento) => {
      // Fuera del aviso de Supabase, para no bloquear su cliente
      if (evento === "SIGNED_IN") setTimeout(revisar, 0);
    });

    return () => {
      vivo = false;
      clearTimeout(temporizador);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
      suscripcion?.data.subscription.unsubscribe();
    };
  }, [revisar, final, pausado]);

  // Espera entre correos (1, 2 y 5 minutos; ver lib/dispositivo)
  useEffect(() => {
    setEspera(esperaParaEnviar(correo));
  }, [correo]);
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function alReenviar() {
    const falta = esperaParaEnviar(correo);
    if (falta > 0) return setEspera(falta);
    setReenviando(true);
    setError(null);
    setAviso(null);
    registrarEnvio(correo);
    const fallo = await reenviar();
    setReenviando(false);
    setEspera(esperaParaEnviar(correo) || 60);
    if (fallo) return setError(fallo);
    setAviso("Te enviamos un correo nuevo. Usa el más reciente.");
  }

  // Recuperar la cuenta: entra aquí con la contraseña nueva y este dispositivo queda de confianza
  async function entrarConNueva(e: React.FormEvent) {
    e.preventDefault();
    const supabase = supabaseNavegador();
    if (!supabase || !nuevaClave) return;
    setEntrando(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: correo, password: nuevaClave });
    if (error) {
      setEntrando(false);
      return setError("Esa no es la contraseña nueva que creaste. Revísala e inténtalo otra vez.");
    }
    if (secreto) await confiarDispositivo(secreto);
    irAdentro();
  }

  if (final === "nueva_clave") {
    return (
      <form onSubmit={entrarConNueva} className="flex flex-col gap-4">
        <Aviso tono="exito" titulo="Tu contraseña se cambió">
          Escribe la contraseña nueva que creaste para entrar aquí.
        </Aviso>
        <CampoTexto
          etiqueta="Contraseña nueva"
          type="password"
          autoComplete="current-password"
          value={nuevaClave}
          onChange={(e) => setNuevaClave(e.target.value)}
          required
          autoFocus
        />
        {error && <Aviso tono="error">{error}</Aviso>}
        <Boton type="submit" ancho cargando={entrando}>
          Entrar
        </Boton>
      </form>
    );
  }

  if (final) {
    const otraVez =
      tipo === "registro"
        ? "Regístrate de nuevo para recibir otro."
        : tipo === "recuperacion"
          ? "Pide la recuperación de nuevo para recibir otro."
          : "Vuelve a ingresar para recibir otro.";
    const textos: Record<Exclude<Final, "nueva_clave">, { tono: "error" | "aviso" | "info"; titulo: string; detalle: string }> = {
      rechazada: {
        tono: "error",
        titulo: tipo === "recuperacion" ? "Se anuló la recuperación" : "Este ingreso fue rechazado",
        detalle:
          tipo === "recuperacion"
            ? "Desde el enlace del correo se respondió “No pedí esto”. La contraseña no cambió."
            : "Desde el enlace del correo se respondió “No fui yo”, así que este dispositivo no puede entrar.",
      },
      vencida: {
        tono: "aviso",
        titulo: "Este enlace ya no sirve",
        detalle: `Venció (dura 10 minutos) o pediste uno más nuevo. ${otraVez}`,
      },
      usada: {
        tono: "info",
        titulo: "Ya entraste desde otro lugar",
        detalle: "Este ingreso se completó en otra pestaña o dispositivo. Si quieres entrar aquí, ingresa de nuevo.",
      },
      entrar_a_mano: {
        tono: "info",
        titulo: tipo === "registro" ? "Tu cuenta quedó confirmada" : "Ya está aprobado",
        detalle: "Ingresa con tu correo y contraseña para continuar.",
      },
    };
    const t = textos[final];
    return (
      <div className="flex flex-col gap-4">
        <Aviso tono={t.tono} titulo={t.titulo}>
          {t.detalle}
        </Aviso>
        {onVolver && final !== "entrar_a_mano" ? (
          <Boton ancho onClick={onVolver}>
            {tipo === "registro" ? "Volver a registrarme" : tipo === "recuperacion" ? "Pedir otro enlace" : "Volver a ingresar"}
          </Boton>
        ) : (
          <Boton ancho href={`/ingresar?next=${encodeURIComponent(destino)}`}>
            Ir a Ingresar
          </Boton>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-marca-tinte">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6D28D9" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 7l9 6 9-6" />
          </svg>
        </span>
        <h2 className="text-lg font-bold">Revisa tu correo</h2>
        {explicacion && <p className="rounded-xl bg-marca-tinte px-3 py-2 text-sm text-marca-texto">{explicacion}</p>}
        <p className="text-sm text-tinta-suave">
          Te enviamos un enlace a <strong className="text-tinta">{correo}</strong>. Si no lo ves, revisa spam.
        </p>
      </div>

      <ol className="flex flex-col gap-1.5 rounded-xl bg-superficie-suave p-3 text-left text-sm text-tinta">
        <li>1. Abre el correo de Supabase Auth.</li>
        <li>
          2. Toca el enlace <strong>“{ENLACE[tipo]}”</strong>.{" "}
          {/* Sin secreto (sin la migración 025 o entrando sin contraseña) solo sirve en este navegador */}
          {secreto ? "Puedes abrirlo aquí o en tu celular." : "Ábrelo en este mismo navegador."}
        </li>
        {tipo === "recuperacion" && <li>3. Ahí mismo crea tu contraseña nueva.</li>}
        <li>
          {tipo === "recuperacion" ? "4" : "3"}. {secreto ? "Listo: esta pantalla seguirá sola." : "Listo: entrarás directo."} El
          enlace dura 10 minutos.
        </li>
      </ol>

      <div className="flex items-center justify-center gap-3 rounded-xl border border-borde p-3 text-sm" role="status" aria-live="polite">
        {pausado ? (
          <>
            <span className="text-tinta-suave">¿Ya tocaste el enlace?</span>
            <Boton
              tamano="sm"
              variante="suave"
              onClick={() => {
                setPausado(false);
                revisar();
              }}
            >
              Revisar ahora
            </Boton>
          </>
        ) : (
          <>
            <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-[3px] border-marca-tinte border-t-marca" aria-hidden="true" />
            <span className="font-medium text-tinta">{entrando ? "¡Confirmado! Entrando…" : "Esperando que toques el enlace…"}</span>
          </>
        )}
      </div>

      {error && <Aviso tono="error">{error}</Aviso>}
      {aviso && !error && <Aviso tono="exito">{aviso}</Aviso>}

      <div className="flex flex-col items-center gap-2 text-sm">
        <button
          type="button"
          onClick={alReenviar}
          disabled={espera > 0 || reenviando}
          className="font-bold text-marca disabled:font-normal disabled:text-tinta-tenue"
        >
          {reenviando ? "Enviando…" : espera > 0 ? `Reenviar correo en ${espera} s` : "Reenviar correo"}
        </button>
        {onVolver && (
          <button type="button" onClick={onVolver} className="text-tinta-suave underline-offset-2 hover:underline">
            {tipo === "dispositivo" ? "Volver" : "Usar otro correo"}
          </button>
        )}
      </div>
    </div>
  );
}
