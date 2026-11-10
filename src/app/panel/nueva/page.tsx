import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/sesionServidor";
import MarcoPanel from "@/components/panel/MarcoPanel";
import AsistenteCancha from "@/components/panel/AsistenteCancha";
import VerificarCelular from "@/components/panel/VerificarCelular";

export const metadata = { title: "Publicar cancha · EasyFut" };
export const dynamic = "force-dynamic";

export default async function NuevaCancha() {
  const sesion = await usuarioActual();
  if (!sesion || sesion.perfil?.rol !== "dueno") redirect("/publicar");

  // Primero el celular verificado: se muestra público en la cancha
  if (!sesion.perfil.telefono_verificado) {
    return (
      <MarcoPanel subtitulo="Antes de publicar" titulo="Confirma tu WhatsApp" volver={{ href: "/panel", texto: "Mi panel" }}>
        <VerificarCelular celularInicial={sesion.perfil.celular} />
      </MarcoPanel>
    );
  }

  return (
    <MarcoPanel subtitulo="Publica tu cancha" titulo="Nueva cancha" volver={{ href: "/panel", texto: "Mi panel" }}>
      <AsistenteCancha />
    </MarcoPanel>
  );
}
