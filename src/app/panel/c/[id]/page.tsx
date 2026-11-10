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
  // El administrador puede gestionar cualquier cancha (migración 012)
  const esAdmin = !!sesion.perfil?.es_admin;
  if (sesion.perfil?.rol !== "dueno" && !esAdmin) redirect("/publicar");

  let consulta = sesion.supabase
    .from("canchas")
    .select("*, franjas(dia_semana, hora_inicio, hora_fin, precio_hora)")
    .eq("id", id);
  if (!esAdmin) consulta = consulta.eq("dueno_id", sesion.user.id);
  const { data } = await consulta.maybeSingle();
  if (!data) notFound();
  const esSuya = data.dueno_id === sesion.user.id;

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
    <MarcoPanel
      subtitulo={esSuya ? cancha.distrito : `Administrador · ${cancha.distrito}`}
      titulo={cancha.nombre}
      volver={esSuya ? { href: "/panel", texto: "Mi panel" } : { href: "/admin", texto: "Administración" }}
    >
      {!esSuya && (
        <p className="rounded-2xl bg-[#1B1B1B] px-4 py-3 text-sm text-white">
          Estás gestionando esta cancha como <strong>administrador</strong>. Los cambios se guardan en la cancha del dueño.
        </p>
      )}
      {esSuya && !sesion.perfil?.telefono_verificado && <VerificarCelular celularInicial={sesion.perfil?.celular} />}
      <GestorCancha
        key={cancha.id}
        cancha={cancha}
        franjas={franjas ?? []}
        nueva={nueva === "1"}
        verificado={!esSuya || !!sesion.perfil?.telefono_verificado}
      />
    </MarcoPanel>
  );
}
