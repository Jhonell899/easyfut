import { notFound, redirect } from "next/navigation";
import { usuarioActual } from "@/lib/sesionServidor";
import { DATOS_VACIOS, pagosDe } from "@/lib/rentador";
import MarcoPanel from "@/components/panel/MarcoPanel";
import GestorCancha, { type CanchaBD } from "@/components/panel/GestorCancha";
import VerificarCelular from "@/components/panel/VerificarCelular";

export const metadata = { title: "Mi cancha · EasyFut" };
export const dynamic = "force-dynamic";

export default async function PanelCancha({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nueva?: string }>;
}) {
  const { id } = await params;
  const { nueva } = await searchParams;
  const sesion = await usuarioActual();
  if (!sesion) redirect(`/ingresar?next=/panel/c/${id}`);
  if (sesion.perfil?.rol !== "dueno") redirect("/publicar");

  const { data } = await sesion.supabase
    .from("canchas")
    .select("*, franjas(dia_semana, hora_inicio, hora_fin, precio_hora)")
    .eq("id", id)
    .eq("dueno_id", sesion.user.id)
    .maybeSingle();
  if (!data) notFound();

  const { franjas, ...resto } = data;
  const cancha: CanchaBD = {
    ...DATOS_VACIOS,
    ...resto,
    descripcion: resto.descripcion ?? "",
    superficie: resto.superficie ?? "",
    modalidades: resto.modalidades ?? [],
    servicios: resto.servicios ?? [],
    fotos: resto.fotos ?? [],
    pagos: pagosDe(resto.pagos),
    latitud: resto.latitud != null ? Number(resto.latitud) : null,
    longitud: resto.longitud != null ? Number(resto.longitud) : null,
  };

  return (
    <MarcoPanel subtitulo={`${cancha.distrito}`} titulo={cancha.nombre} volver={{ href: "/panel", texto: "Mi panel" }}>
      {!sesion.perfil.telefono_verificado && <VerificarCelular celularInicial={sesion.perfil.celular} />}
      <GestorCancha
        key={cancha.id}
        cancha={cancha}
        franjas={franjas ?? []}
        nueva={nueva === "1"}
        verificado={!!sesion.perfil.telefono_verificado}
      />
    </MarcoPanel>
  );
}
