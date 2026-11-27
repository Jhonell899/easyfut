import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * true si la cuenta con sesión ya no tiene datos en `usuarios` (se borró). En ese caso
 * la base de datos borra también su cuenta de acceso y el correo queda libre para
 * registrarse de nuevo (migración 024). Quien llama debe cerrar la sesión.
 */
export async function cuentaBorrada(supabase: SupabaseClient, id: string): Promise<boolean> {
  const { data: borrada, error } = await supabase.rpc("liberar_cuenta_borrada");
  if (!error) return borrada === true;
  // Sin la migración 024: solo se revisa si tiene datos (un fallo de red no cuenta como borrada)
  const { data: perfil, error: errPerfil } = await supabase.from("usuarios").select("id").eq("id", id).maybeSingle();
  return !errPerfil && !perfil;
}

export const MENSAJE_CUENTA_BORRADA = "Esa cuenta ya no existe. Crea una cuenta nueva para entrar.";
