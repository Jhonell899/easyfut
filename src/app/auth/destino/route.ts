import { NextResponse, type NextRequest } from "next/server";
import { usuarioActual } from "@/lib/sesionServidor";

// Tras iniciar sesión, lleva a cada tipo de cuenta a su lugar.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const siguiente = searchParams.get("next");
  const sesion = await usuarioActual();

  if (!sesion) return NextResponse.redirect(`${origin}/ingresar`);
  if (siguiente?.startsWith("/") && siguiente !== "/") {
    return NextResponse.redirect(`${origin}${siguiente}`);
  }
  const modoJugador = request.cookies.get("ef_modo")?.value === "jugador";
  return NextResponse.redirect(`${origin}${sesion.perfil?.rol === "dueno" && !modoJugador ? "/panel" : "/"}`);
}
