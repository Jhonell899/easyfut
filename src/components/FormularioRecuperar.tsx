"use client";

import Link from "next/link";
import { useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { mandarEnlaceRecuperacion, pedirRecuperacion, type Recuperacion } from "@/lib/aprobacion";
import { Aviso, Boton } from "@/components/ui";
import CampoTexto from "@/components/CampoTexto";
import AvisoSinCuenta from "@/components/AvisoSinCuenta";
import EsperarEnlace from "@/components/EsperarEnlace";

/**
 * Olvidé mi contraseña: manda un enlace al correo registrado. Con ese enlace (en este
 * dispositivo o en el celular) se crea la contraseña nueva, y esta pantalla sigue sola.
 */
export default function FormularioRecuperar({ siguiente }: { siguiente?: string }) {
  const [correo, setCorreo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sinCuenta, setSinCuenta] = useState(false);
  const [espera, setEspera] = useState<Recuperacion | null>(null);

  const destino = siguiente?.startsWith("/") && !siguiente.startsWith("//") ? siguiente : "/";
  const sufijo = siguiente ? `?next=${encodeURIComponent(siguiente)}` : "";

  async function pedir(e: React.FormEvent) {
    e.preventDefault();
    const supabase = supabaseNavegador();
    if (!supabase) return setError("La app no está conectada a la base de datos.");
    setEnviando(true);
    setError(null);
    setSinCuenta(false);
    const resultado = await pedirRecuperacion(supabase, correo, destino);
    setEnviando(false);
    if ("sinCuenta" in resultado) return setSinCuenta(true);
    if ("bloqueado" in resultado) return setError("Hubo demasiados intentos. Espera un rato e inténtalo de nuevo.");
    setEspera(resultado);
  }

  if (espera) {
    return (
      <EsperarEnlace
        tipo="recuperacion"
        correo={espera.correo}
        destino={destino}
        secreto={espera.secreto}
        errorInicial={espera.error}
        explicacion="Te enviamos un enlace para crear una contraseña nueva. Solo llega a tu correo registrado."
        reenviar={async () => {
          const supabase = supabaseNavegador();
          if (!supabase) return "La app no está conectada a la base de datos.";
          return mandarEnlaceRecuperacion(supabase, espera.correo, destino, espera.solicitud);
        }}
        onVolver={() => setEspera(null)}
      />
    );
  }

  return (
    <form onSubmit={pedir} className="flex flex-col gap-4">
      <CampoTexto
        etiqueta="Correo de tu cuenta"
        type="email"
        autoComplete="email"
        value={correo}
        onChange={(e) => {
          setCorreo(e.target.value);
          setSinCuenta(false);
        }}
        placeholder="tucorreo@ejemplo.com"
        required
      />
      {sinCuenta && <AvisoSinCuenta sufijo={sufijo} />}
      {error && <Aviso tono="error">{error}</Aviso>}
      <Boton type="submit" ancho tamano="lg" cargando={enviando}>
        Enviarme el enlace
      </Boton>
      <p className="text-center text-sm text-[#5A5A5A]">
        ¿Te acordaste?{" "}
        <Link href={`/ingresar${sufijo}`} className="font-bold text-[#6D28D9]">
          Ingresar
        </Link>
      </p>
    </form>
  );
}
