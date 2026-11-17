import MarcoAuth from "@/components/MarcoAuth";
import ConfirmarDispositivo from "@/components/ConfirmarDispositivo";

export const metadata = { title: "Confirma que eres tú" };
export const dynamic = "force-dynamic";

export default async function VerificarDispositivo({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const destino = next?.startsWith("/") && !next.startsWith("//") ? next : "/panel";
  return (
    <MarcoAuth titulo="Confirma que eres tú" subtitulo="Estás entrando desde un dispositivo nuevo.">
      <ConfirmarDispositivo destino={destino} />
    </MarcoAuth>
  );
}
