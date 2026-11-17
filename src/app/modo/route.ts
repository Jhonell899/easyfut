import { NextResponse, type NextRequest } from "next/server";

// Cambia entre "modo dueño" y "modo jugador" para cuentas de rentador.
// /modo?m=jugador → inicio para reservar como cualquier jugador
// /modo?m=dueno   → vuelve al panel del dueño
export function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const jugador = searchParams.get("m") === "jugador";
  const respuesta = NextResponse.redirect(`${origin}${jugador ? "/" : "/panel"}`);
  if (jugador) {
    respuesta.cookies.set("ef_modo", "jugador", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  } else {
    respuesta.cookies.delete("ef_modo");
  }
  return respuesta;
}
