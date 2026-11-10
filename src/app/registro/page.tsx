import MarcoAuth from "@/components/MarcoAuth";
import FormularioRegistro from "@/components/FormularioRegistro";

export const metadata = { title: "Crear cuenta · EasyFut" };

export default async function PaginaRegistro({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; next?: string }>;
}) {
  const { tipo, next } = await searchParams;
  return (
    <MarcoAuth titulo="Crea tu cuenta" subtitulo="Es gratis y toma menos de un minuto.">
      <FormularioRegistro tipoInicial={tipo === "dueno" ? "dueno" : "cliente"} siguiente={next} />
    </MarcoAuth>
  );
}
