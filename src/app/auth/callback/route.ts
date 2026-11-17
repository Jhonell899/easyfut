import { NextResponse, type NextRequest } from "next/server";
import { supabaseServidor } from "@/lib/sesionServidor";

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
      // Entró con el enlace de su correo: este dispositivo queda de confianza 30 días (migración 018)
      const dispositivo = request.cookies.get("ef_disp")?.value;
      if (dispositivo) await supabase!.rpc("confiar_dispositivo", { p_dispositivo: dispositivo });
      return NextResponse.redirect(`${origin}/auth/destino?next=${encodeURIComponent(destino)}`);
    }
  }
  // El enlace se abrió en otro navegador o ya se usó: la cuenta igual pudo quedar confirmada
  return NextResponse.redirect(`${origin}/ingresar?error=enlace${destino !== "/" ? `&next=${encodeURIComponent(destino)}` : ""}`);
}
