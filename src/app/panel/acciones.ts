"use server";

import { revalidatePath } from "next/cache";

/** Refresca las páginas públicas para que los cambios del rentador se vean al instante. */
export async function refrescarPublico(slug?: string) {
  revalidatePath("/");
  if (slug) revalidatePath(`/c/${slug}`);
}
