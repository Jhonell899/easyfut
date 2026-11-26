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
import ChatsRecientes from "@/components/ChatsRecientes";

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

type SaldoPanel = { saldo: number; precio_reserva: number; reservas_disponibles: number };

const ESTADOS: Record<string, string> = {
  pendiente: "bg-amber-50 text-amber-800",
  confirmada: "bg-[#DCF5EA] text-[#0F7A55]",
  bloqueo: "bg-[#F4F4F4] text-[#5A5A5A]",
};

const hora = (iso: string) => fmtFecha(iso, { hour: "2-digit", minute: "2-digit", hour12: false });

export default async function Panel() {
  const sesion = await usuarioActual();
  if (!sesion) redirect("/ingresar?next=/panel");
  const { supabase, user, perfil } = sesion;

  if (perfil?.rol !== "dueno") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-start gap-4 p-5">
        <Logo />
        <h1 className="text-2xl font-bold">Esta sección es para rentadores</h1>
        <p className="text-sm text-[#5A5A5A]">
          Tu cuenta es de comprador. Desde aquí los dueños gestionan sus canchas y reservas.
        </p>
        <Link href="/" className="font-bold text-[#6D28D9]">
          ← Buscar canchas
        </Link>
      </main>
    );
  }

  const [{ data: canchas }, { data: reservas }, { data: datosSaldo }] = await Promise.all([
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
    supabase.rpc("mi_saldo"), // migración 021
  ]);

  const saldo = (datosSaldo as SaldoPanel[] | null)?.[0] ?? null;
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
              <Link href="/panel/nueva" className="shrink-0 rounded-xl bg-white px-3 py-2 text-sm font-bold text-[#6D28D9]">
                + Nueva cancha
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto -mt-8 flex max-w-xl flex-col gap-5 px-5 pb-10">
        {perfil.celular_verificado ? (
          <p className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm shadow-sm">
            <span className="rounded-full bg-[#DCF5EA] px-2 py-0.5 text-xs font-bold text-[#0F7A55]">✓ WhatsApp confirmado</span>
            <span className="text-[#5A5A5A]">
              Contacto público: <strong className="text-[#1B1B1B]">+51 {perfil.celular_verificado}</strong>
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

        {saldo && <TarjetaSaldo saldo={saldo} />}

        {misCanchas.length > 0 && (
          <Atajo href="/panel/agenda" icono="📅" titulo="Agenda del día" detalle="Todas tus canchas" />
        )}

        {misCanchas.length > 0 && <PendientesEnVivo duenoId={user.id} />}
        {misCanchas.length > 0 && <ChatsRecientes titulo="Chats con tus clientes" />}
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
              <Link href="/panel/nueva" className="rounded-xl bg-[#6D28D9] px-5 py-3 font-bold text-white">
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
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${c.activa ? "bg-[#EDE9FE] text-[#6D28D9]" : "bg-[#F4F4F4] text-[#5A5A5A]"}`}>
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

/** Saldo para recibir reservas (S/ 1 por reserva confirmada). */
function TarjetaSaldo({ saldo }: { saldo: SaldoPanel }) {
  const quedan = saldo.reservas_disponibles;
  const estilo =
    quedan === 0
      ? "border-red-200 bg-red-50"
      : quedan <= 5
        ? "border-amber-200 bg-amber-50"
        : "border-transparent bg-white";
  return (
    <Link href="/panel/saldo" className={`flex items-center justify-between gap-3 rounded-2xl border p-4 shadow-sm ${estilo}`}>
      <span className="min-w-0">
        <span className="block text-xs text-[#5A5A5A]">Saldo para reservas</span>
        <span className="block text-xl font-extrabold text-[#1B1B1B]">
          {soles(Number(saldo.saldo))}{" "}
          <span className="text-sm font-medium text-[#5A5A5A]">
            · {quedan} reserva{quedan === 1 ? "" : "s"}
          </span>
        </span>
        {quedan === 0 ? (
          <span className="block text-xs font-bold text-red-700">Tus canchas no reciben reservas. Recarga para seguir.</span>
        ) : quedan <= 5 ? (
          <span className="block text-xs font-bold text-amber-800">Te quedan pocas reservas. Recarga pronto.</span>
        ) : (
          <span className="block text-xs text-[#5A5A5A]">
            Se descuenta {soles(Number(saldo.precio_reserva))} por cada reserva confirmada.
          </span>
        )}
      </span>
      <span className="boton-morado shrink-0 rounded-xl px-4 py-2 text-sm font-bold text-white">Recargar</span>
    </Link>
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
