import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente para Server Components / Route Handlers con la sesión del usuario.
// Usarlo vuelve la página dinámica (lee cookies).
export async function supabaseServidor() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const almacen = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => almacen.getAll(),
      setAll: (lista) => {
        try {
          lista.forEach(({ name, value, options }) => almacen.set(name, value, options));
        } catch {
          // En Server Components no se pueden escribir cookies; el middleware se encarga.
        }
      },
    },
  });
}

export type Perfil = {
  id: string;
  nombre: string | null;
  celular: string | null;
  rol: "cliente" | "dueno";
  /** Celular confirmado por SMS (9 dígitos), o null. Migración 005. */
  telefono_verificado?: string | null;
  /** Administrador de EasyFut. Migración 008. */
  es_admin?: boolean;
};

/** Usuario con sesión y su perfil, o null. */
export async function usuarioActual() {
  const supabase = await supabaseServidor();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("*") // "*" para no fallar si aún no existe telefono_verificado
    .eq("id", user.id)
    .maybeSingle();
  return { supabase, user, perfil: perfil as Perfil | null };
}
