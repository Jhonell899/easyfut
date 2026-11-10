import Link from "next/link";

export default function NoEncontrado() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#EDE9FE] text-3xl" aria-hidden="true">
        ⚽
      </span>
      <h1 className="text-2xl font-bold">No encontramos esa página</h1>
      <p className="text-sm text-[#5A5A5A]">
        Puede que la cancha ya no esté publicada o que el código de la reserva esté mal escrito.
      </p>
      <Link href="/" className="rounded-xl bg-[#6D28D9] px-6 py-3 font-bold text-white">
        Ver canchas
      </Link>
      <Link href="/reservas" className="text-sm font-medium text-[#6D28D9]">
        Buscar una reserva por su código
      </Link>
    </main>
  );
}
