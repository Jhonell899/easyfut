import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/sesionServidor";
import MarcoPanel from "@/components/panel/MarcoPanel";
import Encargados from "@/components/panel/Encargados";

export const metadata = { title: "Encargados · EasyFut" };
export const dynamic = "force-dynamic";

export default async function PaginaEncargados() {
  const sesion = await usuarioActual();
  if (!sesion) redirect("/ingresar?next=/panel/encargados");
  if (sesion.perfil?.rol !== "dueno") redirect("/panel");

  return (
    <MarcoPanel subtitulo="Tu equipo" titulo="Encargados" volver={{ href: "/panel", texto: "Mi panel" }}>
      <Encargados duenoId={sesion.user.id} />
    </MarcoPanel>
  );
}
