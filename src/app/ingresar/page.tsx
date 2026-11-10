import MarcoAuth from "@/components/MarcoAuth";
import FormularioIngreso from "@/components/FormularioIngreso";

export const metadata = { title: "Ingresar · EasyFut" };

export default async function PaginaIngresar({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <MarcoAuth titulo="¡Hola de nuevo!" subtitulo="Ingresa a tu cuenta de EasyFut.">
      <FormularioIngreso siguiente={next} errorEnlace={error === "enlace"} />
    </MarcoAuth>
  );
}
