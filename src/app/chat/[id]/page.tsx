import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { usuarioActual } from "@/lib/sesionServidor";
import ChatReserva from "@/components/ChatReserva";

export const metadata = { title: "Chat" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Chat entre el dueño y el jugador. El id es propio del chat (uno por pareja). */
export default async function PaginaChat({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sesion = await usuarioActual();
  if (!sesion) redirect(`/ingresar?next=${encodeURIComponent(`/chat/${id}`)}`);

  const esDueno = sesion.perfil?.rol === "dueno";
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 p-5 pb-0">
      <Link href={esDueno ? "/panel" : "/reservas"} className="text-sm font-medium text-[#6D28D9]">
        ← {esDueno ? "Mi panel" : "Mis reservas"}
      </Link>
      <h1 className="text-2xl font-bold text-[#1B1B1B]">Chat</h1>
      <ChatReserva chatId={id.toLowerCase()} />
    </main>
  );
}
