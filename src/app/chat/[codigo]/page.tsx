import Link from "next/link";
import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/sesionServidor";
import ChatReserva from "@/components/ChatReserva";

export const metadata = { title: "Chat de la reserva" };
export const dynamic = "force-dynamic";

export default async function PaginaChat({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const limpio = codigo.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  const sesion = await usuarioActual();
  if (!sesion) redirect(`/ingresar?next=${encodeURIComponent(`/chat/${limpio}`)}`);

  const esDueno = sesion.perfil?.rol === "dueno";
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 p-5 pb-0">
      <Link href={esDueno ? "/panel" : "/reservas"} className="text-sm font-medium text-[#6D28D9]">
        ← {esDueno ? "Mi panel" : "Mis reservas"}
      </Link>
      <h1 className="text-2xl font-bold text-[#1B1B1B]">Chat de la reserva</h1>
      <ChatReserva codigo={limpio} />
    </main>
  );
}
