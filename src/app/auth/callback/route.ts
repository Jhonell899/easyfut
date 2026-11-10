import { NextResponse, type NextRequest } from "next/server";
import { supabaseServidor } from "@/lib/sesionServidor";

// Enlace de confirmación del correo: canjea el código por una sesión.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const codigo = searchParams.get("code");
  const siguiente = searchParams.get("next");
  const destino = siguiente?.startsWith("/") ? siguiente : "/";

  if (codigo) {
    const supabase = await supabaseServidor();
    const { error } = (await supabase?.auth.exchangeCodeForSession(codigo)) ?? { error: true };
    if (!error) return NextResponse.redirect(`${origin}/auth/destino?next=${encodeURIComponent(destino)}`);
  }
  return NextResponse.redirect(`${origin}/ingresar?error=enlace`);
}
