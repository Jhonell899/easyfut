"use client";

import Link from "next/link";
import { useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { clienteCorreo, enlaceDeVuelta } from "@/lib/clienteCorreo";
import CampoTexto from "@/components/CampoTexto";
import VerificarCodigo from "@/components/VerificarCodigo";

type Tipo = "cliente" | "dueno";

const TIPOS: { valor: Tipo; titulo: string; detalle: string; icono: React.ReactNode }[] = [
  {
    valor: "cliente",
    titulo: "Quiero jugar",
    detalle: "Busco y reservo canchas",
    icono: (
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 5.5l4 2.9-1.5 4.7h-5L8 10.4z" />
    ),
  },
  {
    valor: "dueno",
    titulo: "Tengo una cancha",
    detalle: "Quiero alquilarla",
    icono: <path d="M3 21V9l9-6 9 6v12h-6v-7H9v7z" />,
  },
];

function traducir(msg: string): string {
  if (/already registered|already exists/i.test(msg)) return "Ya existe una cuenta con ese correo. Inicia sesión.";
  if (/pwned|leaked|compromised|breach/i.test(msg))
    return "Esa contraseña apareció en filtraciones de datos. Elige otra más segura.";
  if (/password/i.test(msg)) return "La contraseña debe tener al menos 8 caracteres.";
  if (/invalid.*email|email.*invalid/i.test(msg)) return "Ese correo no parece válido.";
  if (/security purposes|after \d+ seconds/i.test(msg)) {
    const seg = msg.match(/(\d+) seconds?/)?.[1];
    return `Ya te enviamos un código hace poco. Espera ${seg ?? "unos"} segundos y vuelve a intentarlo.`;
  }
  if (/rate limit|too many/i.test(msg))
    return "Se alcanzó el límite de correos por hora. Espera unos minutos e inténtalo de nuevo.";
  if (/database error/i.test(msg)) return "No pudimos guardar tu perfil. Avísanos para revisarlo.";
  if (/api key|apikey|jwt/i.test(msg)) return "La app no está bien conectada a la base de datos (clave incorrecta).";
  if (/signups? not allowed|signup is disabled/i.test(msg)) return "El registro está desactivado por ahora.";
  if (/fetch|network|load failed/i.test(msg)) return "Sin conexión. Revisa tu internet e inténtalo de nuevo.";
  // Motivo desconocido: se muestra tal cual para poder diagnosticarlo
  return `No pudimos crear la cuenta. Detalle: ${msg || "sin respuesta del servidor"}`;
}

export default function FormularioRegistro({
  tipoInicial,
  siguiente,
}: {
  tipoInicial: Tipo;
  siguiente?: string;
}) {
  const [tipo, setTipo] = useState<Tipo>(tipoInicial);
  const [nombre, setNombre] = useState("");
  const [celular, setCelular] = useState("");
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [correoExiste, setCorreoExiste] = useState(false);

  const celularLimpio = celular.replace(/\D/g, "");
  const celularValido = /^9\d{8}$/.test(celularLimpio);
  const valido = nombre.trim().length >= 2 && celularValido && correo && clave.length >= 8;

  const destino = siguiente?.startsWith("/") ? siguiente : "/";

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    const supabase = supabaseNavegador();
    if (!supabase || !valido) return;
    setEnviando(true);
    setError(null);
    setCorreoExiste(false);
    const email = correo.trim();

    // Una cuenta que nunca se verificó no cuenta como existente: se borra
    // para que este registro empiece de cero con un código nuevo.
    await supabase.rpc("liberar_correo_no_verificado", { p_correo: email });

    // El correo de confirmación se pide con el cliente de enlaces (funciona en cualquier navegador)
    const { data, error } = await (clienteCorreo() ?? supabase).auth.signUp({
      email,
      password: clave,
      options: {
        data: { nombre: nombre.trim(), celular: celularLimpio, rol: tipo },
        emailRedirectTo: enlaceDeVuelta(destino),
      },
    });

    if (error) {
      setEnviando(false);
      // Si el código no salió, la cuenta tampoco debe quedar creada
      if (/sending.*email|confirmation email/i.test(error.message)) {
        await supabase.rpc("liberar_correo_no_verificado", { p_correo: email });
        return setError("No pudimos enviarte el código. Espera unos minutos e inténtalo de nuevo.");
      }
      if (/already registered|already exists/i.test(error.message)) return setCorreoExiste(true);
      return setError(traducir(error.message));
    }
    // Usuario sin identidades = el correo ya pertenece a una cuenta verificada
    if (data.user && data.user.identities?.length === 0) {
      setEnviando(false);
      return setCorreoExiste(true);
    }
    if (data.session) {
      window.location.assign(`/auth/destino?next=${encodeURIComponent(destino)}`);
    } else {
      setEnviando(false);
      setVerificando(true); // Supabase envió el código al correo
    }
  }

  if (verificando) {
    return (
      <VerificarCodigo
        correo={correo.trim()}
        destino={destino}
        onVolver={() => setVerificando(false)}
      />
    );
  }

  return (
    <form onSubmit={registrar} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-[#1B1B1B]">¿Para qué usarás EasyFut?</legend>
        <div className="grid grid-cols-2 gap-2">
          {TIPOS.map((t) => {
            const activo = tipo === t.valor;
            return (
              <button
                key={t.valor}
                type="button"
                onClick={() => setTipo(t.valor)}
                aria-pressed={activo}
                className={`flex flex-col items-start gap-2 rounded-2xl border-2 p-3 text-left transition-colors ${
                  activo ? "border-[#6D28D9] bg-[#EDE9FE]" : "border-[#E3E3E3] bg-white"
                }`}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill={activo ? "#6D28D9" : "#8A968F"} aria-hidden="true">
                  {t.icono}
                </svg>
                <span>
                  <span className="block font-bold text-[#1B1B1B]">{t.titulo}</span>
                  <span className="block text-xs text-[#5A5A5A]">{t.detalle}</span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <CampoTexto
        etiqueta={tipo === "dueno" ? "Tu nombre o el de tu negocio" : "Nombre y apellido"}
        autoComplete="name"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        required
      />
      <CampoTexto
        etiqueta="Celular"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="987 654 321"
        maxLength={11}
        value={celular}
        onChange={(e) => setCelular(e.target.value)}
        conError={!!celular && !celularValido}
        ayuda={celular && !celularValido ? "Debe tener 9 dígitos y empezar con 9." : undefined}
        required
      />
      <CampoTexto
        etiqueta="Correo"
        type="email"
        autoComplete="email"
        placeholder="tucorreo@ejemplo.com"
        value={correo}
        onChange={(e) => setCorreo(e.target.value)}
        required
      />
      <CampoTexto
        etiqueta="Contraseña"
        type="password"
        autoComplete="new-password"
        value={clave}
        onChange={(e) => setClave(e.target.value)}
        conError={!!clave && clave.length < 8}
        ayuda="Mínimo 8 caracteres. Mejor si mezclas letras y números."
        required
      />

      {correoExiste && (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900" role="alert">
          <p>Ya existe una cuenta verificada con este correo.</p>
          <Link
            href={`/ingresar${siguiente ? `?next=${encodeURIComponent(siguiente)}` : ""}`}
            className="shrink-0 rounded-xl bg-[#6D28D9] px-4 py-2 font-bold text-white"
          >
            Ingresar
          </Link>
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!valido || enviando}
        className="rounded-xl bg-[#6D28D9] py-3 font-bold text-white disabled:opacity-50"
      >
        {enviando ? "Creando cuenta…" : tipo === "dueno" ? "Crear cuenta de rentador" : "Crear cuenta"}
      </button>

      <p className="text-center text-xs text-[#8A968F]">
        Al crear tu cuenta aceptas los{" "}
        <Link href="/terminos" target="_blank" className="underline">
          Términos
        </Link>{" "}
        y la{" "}
        <Link href="/privacidad" target="_blank" className="underline">
          Política de privacidad
        </Link>
        .
      </p>

      <p className="text-center text-sm text-[#5A5A5A]">
        ¿Ya tienes cuenta?{" "}
        <Link
          href={`/ingresar${siguiente ? `?next=${encodeURIComponent(siguiente)}` : ""}`}
          className="font-bold text-[#6D28D9]"
        >
          Ingresar
        </Link>
      </p>
    </form>
  );
}
