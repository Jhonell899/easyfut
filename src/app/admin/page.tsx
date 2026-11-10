import { notFound, redirect } from "next/navigation";
import { usuarioActual } from "@/lib/sesionServidor";
import MarcoPanel from "@/components/panel/MarcoPanel";
import PestanasAdmin from "@/components/admin/PestanasAdmin";

export const metadata = { title: "Administración · EasyFut" };
export const dynamic = "force-dynamic";

export default async function Admin() {
  const sesion = await usuarioActual();
  if (!sesion) redirect("/ingresar?next=/admin");
  if (!sesion.perfil?.es_admin) notFound();

  return (
    <MarcoPanel subtitulo="EasyFut" titulo="Administración">
      <PestanasAdmin />
    </MarcoPanel>
  );
}
