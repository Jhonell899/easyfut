import { NextResponse, type NextRequest } from "next/server";
import { supabaseServidor } from "@/lib/sesionServidor";
import { crearTokenDispositivo, ponerCookieDispositivo } from "@/lib/dispositivoServidor";

// Enlace del correo (confirmar cuenta o entrar desde un dispositivo nuevo):
// canjea el código del enlace por una sesión y deja este dispositivo de confianza.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const codigo = searchParams.get("code");
  const siguiente = searchParams.get("next");
  const destino = siguiente?.startsWith("/") && !siguiente.startsWith("//") ? siguiente : "/";

  if (codigo) {
    const supabase = await supabaseServidor();
    const { error } = (await supabase?.auth.exchangeCodeForSession(codigo)) ?? { error: true };
    if (!error) {
      // Entró con el enlace de su correo: este dispositivo recibe su token único (migración 018)
      const respuesta = NextResponse.redirect(`${origin}/auth/destino?next=${encodeURIComponent(destino)}`);
      const { token } = await crearTokenDispositivo(supabase!, request.headers);
      if (token) ponerCookieDispositivo(respuesta, token);
      return respuesta;
    }
  }
  // El enlace se abrió en otro navegador o ya se usó: la cuenta igual pudo quedar confirmada
  return NextResponse.redirect(`${origin}/ingresar?error=enlace${destino !== "/" ? `&next=${encodeURIComponent(destino)}` : ""}`);
}
