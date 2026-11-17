"use client";

import { useEffect } from "react";

/**
 * Si Supabase devuelve el enlace del correo a otra página (por ejemplo, al
 * inicio, cuando la dirección de vuelta no está permitida), lo manda a
 * /auth/confirmar para que igual se pueda entrar.
 */
export default function RedirigirEnlace() {
  useEffect(() => {
    const { hash, pathname, search } = window.location;
    if (pathname === "/auth/confirmar") return;
    if (/(^|[#&])(access_token|error_code)=/.test(hash)) {
      window.location.replace(`/auth/confirmar${search}${hash}`);
    }
  }, []);
  return null;
}
