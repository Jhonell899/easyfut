import Link from "next/link";
import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/sesionServidor";
import Logo from "@/components/Logo";
import MenuUsuario from "@/components/MenuUsuario";
import { fmtFecha, soles } from "@/lib/horario";
import VerificarCelular from "@/components/panel/VerificarCelular";
import PendientesEnVivo from "@/components/panel/PendientesEnVivo";
import BloqueadosDueno from "@/components/panel/BloqueadosDueno";
import IngresosDueno from "@/components/panel/IngresosDueno";

export const metadata = { title: "Mi panel" };
export const dynamic = "force-dynamic";

type CanchaPanel = { id: string; nombre: string; slug: string; distrito: string; activa: boolean };
type ReservaPanel = {
  codigo: string;
  estado: string;
  inicio: string;
  fin: string;
  monto: number;
  nombre_cliente: string | null;
  celular_cliente: string | null;
  canchas: { id: string; nombre: string } | null;
};

const ESTADOS: Record<string, string> = {
  pendiente: "bg-amber-50 text-amber-800",
  confirmada: "bg-[#E6EEEA] text-[#0B6E4F]",
  bloqueo: "bg-[#F4F4F4] text-[#5A5A5A]",
};

const hora = (iso: string) => fmtFecha(iso, { hour: "2-digit", minute: "2-digit", hour12: false });

export default async function Panel({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  const sesion = await usuarioActual();
  if (!sesion) redirect("/ingresar?next=/panel");
  const { supabase, user, perfil } = sesion;

  // ¿Trabaja como encargado de algún local? (migración 011)
  const { data: datosLocales } = await supabase.rpc("mis_locales");
  const locales = (datosLocales ?? []) as { dueno_id: string; dueno_nombre: string | null; canchas: number }[];

  if (perfil?.rol !== "dueno" || (d && d !== user.id && locales.some((l) => l.dueno_id === d))) {
    const local = locales.find((l) => l.dueno_id === d) ?? locales[0];
    if (local) return <PanelEncargado local={local} locales={locales} nombre={perfil?.nombre ?? null} />;
  }

  if (perfil?.rol !== "dueno") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-start gap-4 p-5">
        <Logo />
        <h1 className="text-2xl font-bold">Esta sección es para rentadores</h1>
        <p className="text-sm text-[#5A5A5A]">
          Tu cuenta es de comprador. Desde aquí los dueños gestionan sus canchas y reservas.
        </p>
        <Link href="/" className="font-bold text-[#0B6E4F]">
          ← Buscar canchas
        </Link>
      </main>
    );
  }

  const [{ data: canchas }, { data: reservas }] = await Promise.all([
    supabase
      .from("canchas")
      .select("id, nombre, slug, distrito, activa")
      .eq("dueno_id", user.id)
      .order("created_at"),
    supabase
      .from("reservas")
      .select("codigo, estado, inicio, fin, monto, nombre_cliente, celular_cliente, canchas!inner(id, nombre, dueno_id)")
      .eq("canchas.dueno_id", user.id)
      .in("estado", ["pendiente", "confirmada", "bloqueo"])
      .gte("fin", new Date().toISOString())
      .order("inicio")
      .limit(30),
  ]);

  const misCanchas = (canchas ?? []) as CanchaPanel[];
  const proximas = (reservas ?? []) as unknown as ReservaPanel[];
  const pendientes = proximas.filter((r) => r.estado === "pendiente").length;

  return (
    <div className="min-h-screen">
      <header className="fondo-cancha text-white">
        <div className="mx-auto flex max-w-xl flex-col gap-6 px-5 pb-14 pt-5">
          <nav className="flex items-center justify-between">
            <Logo claro />
            <MenuUsuario claro />
          </nav>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm text-white/80">Panel del rentador</p>
              <h1 className="text-2xl font-extrabold">Hola, {perfil.nombre?.split(" ")[0] ?? "dueño"}</h1>
            </div>
            {misCanchas.length > 0 && (
              <Link href="/panel/nueva" className="shrink-0 rounded-xl bg-white px-3 py-2 text-sm font-bold text-[#0B6E4F]">
                + Nueva cancha
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto -mt-8 flex max-w-xl flex-col gap-5 px-5 pb-10">
        {perfil.telefono_verificado ? (
          <p className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm shadow-sm">
            <span className="rounded-full bg-[#E6EEEA] px-2 py-0.5 text-xs font-bold text-[#0B6E4F]">✓ WhatsApp confirmado</span>
            <span className="text-[#5A5A5A]">
              Contacto público: <strong className="text-[#1B1B1B]">+51 {perfil.telefono_verificado}</strong>
            </span>
          </p>
        ) : (
          <VerificarCelular celularInicial={perfil.celular} />
        )}

        <div className="grid grid-cols-3 gap-2">
          <Dato valor={misCanchas.length} etiqueta="Canchas" />
          <Dato valor={proximas.length} etiqueta="Próximas" />
          <Dato valor={pendientes} etiqueta="Por cobrar" resaltar={pendientes > 0} />
        </div>

        {misCanchas.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <Atajo href="/panel/agenda" icono="📅" titulo="Agenda del día" detalle="Todas tus canchas" />
            <Atajo href="/panel/encargados" icono="👥" titulo="Encargados" detalle="Tu equipo" />
          </div>
        )}
        {locales.length > 0 && (
          <Link href={`/panel?d=${locales[0].dueno_id}`} className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-[#0B6E4F] shadow-sm">
            También eres encargado en {locales[0].dueno_nombre ?? "otro local"} →
          </Link>
        )}

        {misCanchas.length > 0 && <PendientesEnVivo duenoId={user.id} />}
        {misCanchas.length > 0 && <IngresosDueno duenoId={user.id} />}
        {misCanchas.length > 0 && <BloqueadosDueno duenoId={user.id} />}

        <section className="flex flex-col gap-2">
          <h2 className="font-bold">Próximas reservas</h2>
          {proximas.length === 0 ? (
            <p className="rounded-2xl bg-white p-4 text-sm text-[#5A5A5A]">
              Aún no tienes reservas próximas.
            </p>
          ) : (
            <ul className="divide-y divide-[#E3E3E3] overflow-hidden rounded-2xl bg-white">
              {proximas.map((r) => (
                <li key={r.codigo}>
                  <Link href={`/panel/c/${r.canchas?.id}`} className="flex items-center justify-between gap-3 p-4 text-sm hover:bg-[#FAFAFA]">
                  <div className="min-w-0">
                    <p className="font-bold first-letter:uppercase">
                      {fmtFecha(r.inicio, { weekday: "short", day: "numeric", month: "short" })} ·{" "}
                      {hora(r.inicio)}–{hora(r.fin)}
                    </p>
                    <p className="truncate text-[#5A5A5A]">
                      {r.estado === "bloqueo"
                        ? "Horario bloqueado"
                        : `${r.nombre_cliente} · ${r.celular_cliente}`}
                    </p>
                    <p className="truncate text-xs text-[#8A968F]">{r.canchas?.nombre}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${ESTADOS[r.estado] ?? ""}`}>
                      {r.estado}
                    </span>
                    {r.estado !== "bloqueo" && <span className="font-bold">{soles(r.monto)}</span>}
                  </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-bold">Mis canchas</h2>
          {misCanchas.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-2xl bg-white p-5">
              <div>
                <p className="font-bold">Publica tu primera cancha</p>
                <p className="text-sm text-[#5A5A5A]">
                  En unos minutos: datos, ubicación, horarios, precios y fotos.
                </p>
              </div>
              <Link href="/panel/nueva" className="rounded-xl bg-[#0B6E4F] px-5 py-3 font-bold text-white">
                Publicar cancha
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-[#E3E3E3] overflow-hidden rounded-2xl bg-white">
              {misCanchas.map((c) => (
                <li key={c.id}>
                  <Link href={`/panel/c/${c.id}`} className="flex items-center justify-between p-4 text-sm hover:bg-[#FAFAFA]">
                    <span>
                      <span className="block font-bold">{c.nombre}</span>
                      <span className="text-[#5A5A5A]">{c.distrito}</span>
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${c.activa ? "bg-[#E6EEEA] text-[#0B6E4F]" : "bg-[#F4F4F4] text-[#5A5A5A]"}`}>
                      {c.activa ? "Publicada" : "Pausada"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function Dato({ valor, etiqueta, resaltar }: { valor: number; etiqueta: string; resaltar?: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-3 text-center shadow-sm">
      <p className={`text-2xl font-extrabold ${resaltar ? "text-amber-600" : "text-[#1B1B1B]"}`}>{valor}</p>
      <p className="text-xs text-[#5A5A5A]">{etiqueta}</p>
    </div>
  );
}

function Atajo({ href, icono, titulo, detalle }: { href: string; icono: string; titulo: string; detalle: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm hover:bg-[#FAFAFA]">
      <span className="text-2xl" aria-hidden="true">
        {icono}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-bold">{titulo}</span>
        <span className="block truncate text-xs text-[#5A5A5A]">{detalle}</span>
      </span>
    </Link>
  );
}

/** Panel de quien trabaja como encargado en el local de otro dueño. */
function PanelEncargado({
  local,
  locales,
  nombre,
}: {
  local: { dueno_id: string; dueno_nombre: string | null; canchas: number };
  locales: { dueno_id: string; dueno_nombre: string | null; canchas: number }[];
  nombre: string | null;
}) {
  return (
    <div className="min-h-screen">
      <header className="fondo-cancha text-white">
        <div className="mx-auto flex max-w-xl flex-col gap-6 px-5 pb-14 pt-5">
          <nav className="flex items-center justify-between">
            <Logo claro />
            <MenuUsuario claro />
          </nav>
          <div>
            <p className="text-sm text-white/80">Encargado · {local.dueno_nombre ?? "Local"}</p>
            <h1 className="text-2xl font-extrabold">Hola, {nombre?.split(" ")[0] ?? "encargado"}</h1>
          </div>
        </div>
      </header>
      <main className="mx-auto -mt-8 flex max-w-xl flex-col gap-5 px-5 pb-10">
        {locales.length > 1 && (
          <div className="sin-scroll -mx-5 flex gap-2 overflow-x-auto px-5">
            {locales.map((l) => (
              <Link
                key={l.dueno_id}
                href={`/panel?d=${l.dueno_id}`}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${
                  l.dueno_id === local.dueno_id ? "bg-[#1B1B1B] text-white" : "bg-white shadow-sm"
                }`}
              >
                {l.dueno_nombre ?? "Local"}
              </Link>
            ))}
          </div>
        )}
        <Atajo
          href={`/panel/agenda?d=${local.dueno_id}`}
          icono="📅"
          titulo="Agenda del día"
          detalle={`${local.canchas} cancha${local.canchas === 1 ? "" : "s"}`}
        />
        <PendientesEnVivo duenoId={local.dueno_id} puedeBloquear={false} />
        <p className="text-center text-xs text-[#8A968F]">
          Como encargado puedes confirmar pagos, cancelar y registrar reservas. Los precios y horarios los cambia el dueño.
        </p>
      </main>
    </div>
  );
}
