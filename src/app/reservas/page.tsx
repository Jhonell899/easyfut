import Link from "next/link";
import MisReservas from "@/components/MisReservas";

export const metadata = { title: "Mis reservas" };

export default function PaginaMisReservas() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-5 p-5">
      <Link href="/" className="text-sm font-medium text-[#0B6E4F]">
        ← Todas las canchas
      </Link>
      <h1 className="text-2xl font-bold text-[#1B1B1B]">Mis reservas</h1>
      <MisReservas />
    </main>
  );
}
