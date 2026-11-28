import MarcoAuth from "@/components/MarcoAuth";
import FormularioRecuperar from "@/components/FormularioRecuperar";

export const metadata = { title: "Recuperar cuenta" };

export default async function PaginaRecuperar({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <MarcoAuth titulo="Recupera tu cuenta" subtitulo="Te enviaremos un enlace a tu correo registrado.">
      <FormularioRecuperar siguiente={next} />
    </MarcoAuth>
  );
}
