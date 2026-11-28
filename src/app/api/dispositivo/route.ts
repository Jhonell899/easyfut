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

// POST: marcar este dispositivo como de confianza: justo después de entrar con el
// enlace del correo, o con { secreto } de una solicitud de ingreso aprobada (migración 025)
export async function POST(request: NextRequest) {
  const supabase = await supabaseServidor();
  if (!supabase) return NextResponse.json({ ok: false, error: "sin_configurar" }, { status: 500 });
  let secreto: string | null = null;
  try {
    const cuerpo = (await request.json()) as { secreto?: unknown };
    if (typeof cuerpo?.secreto === "string" && /^[0-9a-f]{64}$/.test(cuerpo.secreto)) secreto = cuerpo.secreto;
  } catch {
    // sin cuerpo: entró con el enlace del correo
  }
  const { token, error } = await crearTokenDispositivo(supabase, request.headers, secreto);
  if (!token) {
    const codigo = error === "migracion_pendiente"
      ? "migracion_pendiente"
      : /demasiados_intentos/.test(error ?? "")
        ? "demasiados_intentos"
        : /requiere_codigo/.test(error ?? "")
          ? "requiere_codigo"
          : /sin_aprobacion/.test(error ?? "")
            ? "sin_aprobacion"
            : "error";
    return NextResponse.json({ ok: false, error: codigo }, { status: codigo === "migracion_pendiente" ? 200 : 400 });
  }
  const respuesta = NextResponse.json({ ok: true });
  ponerCookieDispositivo(respuesta, token);
  return respuesta;
}
