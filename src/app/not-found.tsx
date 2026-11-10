import Link from "next/link";

export default function NoEncontrado() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-start gap-4 p-5">
      <h1 className="text-2xl font-bold">No encontramos esa página</h1>
      <p className="text-sm text-[#5A5A5A]">
        Puede que la cancha ya no esté disponible.
      </p>
      <Link href="/" className="text-sm font-medium text-[#0B6E4F]">
        ← Volver a las canchas
      </Link>
    </main>
  );
}
