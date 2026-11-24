import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_DISPOSITIVO, dispositivoEsConfiable } from "@/lib/dispositivoServidor";

// Zonas que manejan dinero y datos de clientes: piden el código de correo
// la primera vez que se entra desde un dispositivo nuevo (migración 018).
const PROTEGIDAS = ["/panel", "/admin"];

// Renueva la sesión de Supabase en cada visita para que no caduque.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        lista.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        lista.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ruta = request.nextUrl.pathname;
  const esProtegida = PROTEGIDAS.some((p) => ruta === p || ruta.startsWith(`${p}/`));

  if (esProtegida) {
    // Sin sesión: directo a Ingresar
    if (!user) {
      const destino = request.nextUrl.clone();
      destino.pathname = "/ingresar";
      destino.search = `?next=${encodeURIComponent(ruta + request.nextUrl.search)}`;
      const redireccion = NextResponse.redirect(destino);
      response.cookies.getAll().forEach((c) => redireccion.cookies.set(c));
      return redireccion;
    }

    // Token único del dispositivo (cookie httpOnly). Si la migración 018 no existe, no se bloquea a nadie.
    const confiable = await dispositivoEsConfiable(
      supabase,
      request.cookies.get(COOKIE_DISPOSITIVO)?.value,
      request.headers
    );
    if (confiable === false) {
      const destino = request.nextUrl.clone();
      destino.pathname = "/verificar-dispositivo";
      destino.search = `?next=${encodeURIComponent(ruta + request.nextUrl.search)}`;
      const redireccion = NextResponse.redirect(destino);
      // Conserva las cookies de sesión que Supabase haya renovado
      response.cookies.getAll().forEach((c) => redireccion.cookies.set(c));
      return redireccion;
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
