"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Si una página falla, se ofrece reintentar en vez de mostrar un error técnico. */
export default function ErrorPagina({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-3xl" aria-hidden="true">
        ⚠️
      </span>
      <h1 className="text-2xl font-bold">Algo salió mal</h1>
      <p className="text-sm text-[#5A5A5A]">
        No pudimos cargar esta pantalla. Revisa tu conexión a internet e inténtalo otra vez.
      </p>
      <button type="button" onClick={reset} className="rounded-xl bg-[#0B6E4F] px-6 py-3 font-bold text-white">
        Reintentar
      </button>
      <Link href="/" className="text-sm font-medium text-[#0B6E4F]">
        Volver al inicio
      </Link>
    </main>
  );
}
