import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/sesionServidor";
import MarcoPanel from "@/components/panel/MarcoPanel";
import AgendaDia from "@/components/panel/AgendaDia";

export const metadata = { title: "Agenda" };
export const dynamic = "force-dynamic";

export default async function Agenda({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  const sesion = await usuarioActual();
  if (!sesion) redirect("/ingresar?next=/panel/agenda");

  // Dueño: su propia agenda
  if (sesion.perfil?.rol === "dueno" && (!d || d === sesion.user.id)) {
    return (
      <MarcoPanel subtitulo="Todas tus canchas" titulo="Agenda del día" volver={{ href: "/panel", texto: "Mi panel" }}>
        <AgendaDia duenoId={sesion.user.id} puedeBloquearClientes />
      </MarcoPanel>
    );
  }

  // Administrador: la agenda de cualquier dueño (migración 012)
  if (sesion.perfil?.es_admin && d) {
    return (
      <MarcoPanel subtitulo="Administrador" titulo="Agenda del día" volver={{ href: "/admin", texto: "Administración" }}>
        <AgendaDia duenoId={d} puedeBloquearClientes={false} />
      </MarcoPanel>
    );
  }

  // Solo la cuenta dueña (o el administrador) ve la agenda
  redirect("/panel");
}
