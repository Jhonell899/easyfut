import { NextResponse, type NextRequest } from "next/server";
import { supabaseServidor } from "@/lib/sesionServidor";
import {
  COOKIE_DISPOSITIVO,
  crearTokenDispositivo,
  dispositivoEsConfiable,
  ponerCookieDispositivo,
} from "@/lib/dispositivoServidor";

export const dynamic = "force-dynamic";

// GET: ¿este dispositivo es de confianza para la cuenta con sesión?
//   { confiable: true | false | null }   (null = migración 018 pendiente)
export async function GET(request: NextRequest) {
  const supabase = await supabaseServidor();
  if (!supabase) return NextResponse.json({ confiable: null });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ confiable: false });
  const confiable = await dispositivoEsConfiable(
    supabase,
    request.cookies.get(COOKIE_DISPOSITIVO)?.value,
    request.headers
  );
  return NextResponse.json({ confiable }, { headers: { "Cache-Control": "no-store" } });
}

// POST: marcar este dispositivo como de confianza (solo justo después de entrar con el correo)
export async function POST(request: NextRequest) {
  const supabase = await supabaseServidor();
  if (!supabase) return NextResponse.json({ ok: false, error: "sin_configurar" }, { status: 500 });
  const { token, error } = await crearTokenDispositivo(supabase, request.headers);
  if (!token) {
    const codigo = error === "migracion_pendiente"
      ? "migracion_pendiente"
      : /demasiados_intentos/.test(error ?? "")
        ? "demasiados_intentos"
        : /requiere_codigo/.test(error ?? "")
          ? "requiere_codigo"
          : "error";
    return NextResponse.json({ ok: false, error: codigo }, { status: codigo === "migracion_pendiente" ? 200 : 400 });
  }
  const respuesta = NextResponse.json({ ok: true });
  ponerCookieDispositivo(respuesta, token);
  return respuesta;
}
