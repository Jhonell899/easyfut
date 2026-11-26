import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/sesionServidor";
import MarcoPanel from "@/components/panel/MarcoPanel";
import SaldoDueno from "@/components/panel/SaldoDueno";

export const metadata = { title: "Saldo y recargas" };
export const dynamic = "force-dynamic";

export default async function Saldo() {
  const sesion = await usuarioActual();
  if (!sesion) redirect("/ingresar?next=/panel/saldo");
  if (sesion.perfil?.rol !== "dueno") redirect("/panel");

  return (
    <MarcoPanel subtitulo="S/ 1 por reserva confirmada" titulo="Saldo y recargas" volver={{ href: "/panel", texto: "Mi panel" }}>
      <SaldoDueno />
    </MarcoPanel>
  );
}
