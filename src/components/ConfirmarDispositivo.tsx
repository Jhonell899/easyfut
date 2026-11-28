"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { cuentaBorrada } from "@/lib/cuentas";
import { mandarEnlaceIngreso, prepararIngresoNuevo, type IngresoNuevo } from "@/lib/aprobacion";
import { Aviso } from "@/components/ui";
import EsperarEnlace from "@/components/EsperarEnlace";

/** Pide confirmar con el enlace del correo para usar el panel desde un dispositivo nuevo. */
export default function ConfirmarDispositivo({ destino }: { destino: string }) {
  const [correo, setCorreo] = useState<string | null>(null);
  const [ingreso, setIngreso] = useState<IngresoNuevo | null>(null);
  const yaEnviado = useRef(false);

  useEffect(() => {
    const supabase = supabaseNavegador();
    if (!supabase || yaEnviado.current) return;
    yaEnviado.current = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) return window.location.assign(`/ingresar?next=${encodeURIComponent(destino)}`);
      // Cuenta borrada con una sesión vieja: no se manda correo, se cierra la sesión
      if (await cuentaBorrada(supabase, user.id)) {
        await supabase.auth.signOut({ scope: "local" });
        return window.location.assign(`/ingresar?next=${encodeURIComponent(destino)}`);
      }
      setCorreo(user.email);
      // La sesión sigue abierta: al aprobarse, este dispositivo queda de confianza
      setIngreso(await prepararIngresoNuevo(supabase, user.email, destino));
    })();
  }, [destino]);

  if (!correo || !ingreso) return <div className="h-40 animate-pulse rounded-2xl bg-[#F3F1FA]" />;

  return (
    <div className="flex flex-col gap-3">
      {ingreso.bloqueado ? (
        <Aviso tono="aviso" titulo="Demasiados intentos">
          Hubo demasiados intentos de ingreso en la última hora. Espera un rato y vuelve a abrir esta página.
        </Aviso>
      ) : (
        <EsperarEnlace
          tipo="dispositivo"
          correo={correo}
          destino={destino}
          secreto={ingreso.secreto}
          errorInicial={ingreso.error}
          explicacion="Para proteger tus canchas y el dinero de tus clientes, confirma con el enlace que te enviamos a tu correo. Este dispositivo quedará de confianza por 30 días."
          reenviar={async () => {
            const supabase = supabaseNavegador();
            if (!supabase) return "La app no está conectada a la base de datos.";
            return mandarEnlaceIngreso(supabase, correo, destino, ingreso.solicitud);
          }}
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
