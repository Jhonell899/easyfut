"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { idDispositivo } from "@/lib/dispositivo";
import { clienteCorreo, enlaceDeVuelta } from "@/lib/clienteCorreo";
import VerificarCodigo from "@/components/VerificarCodigo";

/** Pide el código de correo para usar el panel desde un dispositivo nuevo. */
export default function ConfirmarDispositivo({ destino }: { destino: string }) {
  const [correo, setCorreo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const yaEnviado = useRef(false);

  useEffect(() => {
    idDispositivo(); // asegura la cookie de este dispositivo
    const supabase = supabaseNavegador();
    if (!supabase || yaEnviado.current) return;
    yaEnviado.current = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) return window.location.assign(`/ingresar?next=${encodeURIComponent(destino)}`);
      setCorreo(user.email);
      const { error } = await (clienteCorreo() ?? supabase).auth.signInWithOtp({
        email: user.email,
        options: { shouldCreateUser: false, emailRedirectTo: enlaceDeVuelta(destino) },
      });
      if (error)
        return setError(
          /security purposes|rate limit|too many/i.test(error.message)
            ? "Ya te enviamos un código hace poco. Revisa tu correo o espera un minuto y usa “Reenviar código”."
            : "No pudimos enviarte el código. Inténtalo de nuevo en unos minutos."
        );
      setEnviado(true);
    })();
  }, [destino]);

  if (!correo) return <div className="h-40 animate-pulse rounded-2xl bg-[#F3F1FA]" />;

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          {error}
        </p>
      )}
      {(enviado || error) && (
        <VerificarCodigo
          correo={correo}
          destino={destino}
          tipo="email"
          explicacion="Para proteger tus canchas y el dinero de tus clientes, confirma con el código que te enviamos a tu correo. Este dispositivo quedará de confianza por 30 días."
        />
      )}
      <button
        type="button"
        onClick={async () => {
          await supabaseNavegador()?.auth.signOut();
          window.location.assign("/");
        }}
        className="text-center text-sm text-[#5A5A5A]"
      >
        No fui yo · Cerrar sesión
      </button>
    </div>
  );
}
