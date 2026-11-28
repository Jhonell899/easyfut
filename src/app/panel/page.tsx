import Link from "next/link";
import { redirect } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
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
type Movimiento = { tipo: string; monto: number };

const ESTADOS: Record<string, string> = {
  pendiente: "bg-amber-50 text-amber-800",
  confirmada: "bg-[#DCF5EA] text-[#0F7A55]",
  bloqueo: "bg-[#F4F4F4] text-[#5A5A5A]",
};

const hora = (iso: string) => fmtFecha(iso, { hour: "2-digit", minute: "2-digit", hour12: false });

/** Buenos días / tardes / noches según la hora de Lima. */
function saludo(): string {
  const h = Number(
    new Intl.DateTimeFormat("es-PE", { hour: "numeric", hourCycle: "h23", timeZone: "America/Lima" }).format(new Date())
  );
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

/** Cada bloque del panel entra con una pequeña animación, uno detrás de otro. */
function Aparece({ orden, children }: { orden: number; children: ReactNode }) {
  return (
    <div className="animate-aparecer" style={{ animationDelay: `${orden * 70}ms` } as CSSProperties}>
      {children}
    </div>
  );
}

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

  const [{ data: canchas }, { data: reservas }, { data: datosSaldo }, { data: movimientos }, { count: totalReservas }] =
    await Promise.all([
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
      // De dónde viene el saldo (para saber si todavía es el bono de bienvenida)
      supabase.from("movimientos_saldo").select("tipo, monto").eq("dueno_id", user.id),
      // ¿Ya recibió alguna reserva alguna vez? (para la guía de primeros pasos)
      supabase
        .from("reservas")
        .select("codigo, canchas!inner(dueno_id)", { count: "exact", head: true })
        .eq("canchas.dueno_id", user.id)
        .neq("estado", "bloqueo"),
    ]);

  const saldo = (datosSaldo as SaldoPanel[] | null)?.[0] ?? null;
  const misCanchas = (canchas ?? []) as CanchaPanel[];
  const proximas = (reservas ?? []) as unknown as ReservaPanel[];
  const pendientes = proximas.filter((r) => r.estado === "pendiente").length;
  const tieneCanchas = misCanchas.length > 0;

  // El saldo es solo el bono de bienvenida mientras no haya recargas ni ajustes a favor
  const movs = (movimientos ?? []) as Movimiento[];
  const bono = movs.filter((m) => m.tipo === "regalo").reduce((s, m) => s + Number(m.monto), 0);
  const soloBono = bono > 0 && !movs.some((m) => m.tipo !== "regalo" && m.tipo !== "reserva" && Number(m.monto) > 0);

  // Guía de primeros pasos: se muestra hasta recibir la primera reserva
  const pasos: Paso[] = [
    { hecho: true, titulo: "Creaste tu cuenta de rentador" },
    {
      hecho: !!perfil.celular_verificado,
      titulo: "Confirma tu WhatsApp",
      detalle: "Tus clientes te escriben ahí.",
    },
    {
      hecho: tieneCanchas,
      titulo: "Publica tu primera cancha",
      detalle: "En unos minutos: datos, ubicación, horarios, precios y fotos.",
      href: "/panel/nueva",
      accion: "Publicar cancha",
    },
    {
      hecho: (totalReservas ?? 0) > 0,
      titulo: "Recibe tu primera reserva",
      detalle: "Comparte el enlace de tu cancha por WhatsApp y en tus redes.",
      href: misCanchas[0] ? `/panel/c/${misCanchas[0].id}` : undefined,
      accion: "Ver mi cancha",
    },
  ];
  const guiaCompleta = pasos.every((p) => p.hecho);

  let orden = 0;

  return (
    <div className="min-h-screen">
      <header className="fondo-cancha text-white">
        <div className="mx-auto flex max-w-xl flex-col gap-6 px-5 pb-14 pt-5">
          <nav className="flex items-center justify-between">
            <Logo claro />
            <MenuUsuario claro />
          </nav>
          <div className="flex items-end justify-between gap-3">
            <div className="animate-aparecer">
              <p className="text-sm text-white/80">Panel del rentador</p>
              <h1 className="text-2xl font-extrabold">
                {saludo()}, {perfil.nombre?.split(" ")[0] ?? "dueño"}
              </h1>
            </div>
            {tieneCanchas && (
              <Link
                href="/panel/nueva"
                className="shrink-0 rounded-xl bg-white px-3 py-2 text-sm font-bold text-[#6D28D9] transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                + Nueva cancha
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto -mt-8 flex max-w-xl flex-col gap-5 px-5 pb-10">
        <Aparece orden={orden++}>
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
        </Aparece>

        {/* Cifras: solo tienen sentido cuando ya hay canchas */}
        {tieneCanchas && (
          <Aparece orden={orden++}>
            <div className="grid grid-cols-3 gap-2">
              <Dato valor={misCanchas.length} etiqueta={misCanchas.length === 1 ? "Cancha" : "Canchas"} />
              <Dato valor={proximas.length} etiqueta="Próximas" href="/panel/agenda" />
              <Dato valor={pendientes} etiqueta="Por cobrar" resaltar={pendientes > 0} />
            </div>
          </Aparece>
        )}

        {!guiaCompleta && (
          <Aparece orden={orden++}>
            <GuiaPrimerosPasos pasos={pasos} />
          </Aparece>
        )}

        {saldo && (
          <Aparece orden={orden++}>
            <TarjetaSaldo saldo={saldo} soloBono={soloBono} bono={bono} />
          </Aparece>
        )}

        {tieneCanchas && (
          <Aparece orden={orden++}>
            <Atajo href="/panel/agenda" icono="📅" titulo="Agenda del día" detalle="Todas tus canchas" />
          </Aparece>
        )}

        {tieneCanchas && <PendientesEnVivo duenoId={user.id} />}
        {tieneCanchas && <ChatsRecientes titulo="Chats con tus clientes" />}
        {tieneCanchas && <IngresosDueno duenoId={user.id} />}
        {tieneCanchas && <BloqueadosDueno duenoId={user.id} />}

        {/* Próximas reservas: solo cuando ya hay canchas que puedan recibirlas */}
        {tieneCanchas && (
          <Aparece orden={orden++}>
            <section className="flex flex-col gap-2">
              <h2 className="font-bold">Próximas reservas</h2>
              {proximas.length === 0 ? (
                <p className="rounded-2xl bg-white p-4 text-sm text-[#5A5A5A]">
                  Aún no tienes reservas próximas. Comparte el enlace de tu cancha para recibir la primera.
                </p>
              ) : (
                <ul className="divide-y divide-[#E3E3E3] overflow-hidden rounded-2xl bg-white">
                  {proximas.map((r) => (
                    <li key={r.codigo}>
                      <Link
                        href={`/panel/c/${r.canchas?.id}`}
                        className="flex items-center justify-between gap-3 p-4 text-sm transition hover:bg-[#FAFAFA]"
                      >
                        <div className="min-w-0">
                          <p className="font-bold first-letter:uppercase">
                            {fmtFecha(r.inicio, { weekday: "short", day: "numeric", month: "short" })} ·{" "}
                            {hora(r.inicio)}–{hora(r.fin)}
                          </p>
                          <p className="truncate text-[#5A5A5A]">
                            {r.estado === "bloqueo" ? "Horario bloqueado" : `${r.nombre_cliente} · ${r.celular_cliente}`}
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
          </Aparece>
        )}

        {tieneCanchas && (
          <Aparece orden={orden++}>
            <section className="flex flex-col gap-2">
              <h2 className="font-bold">Mis canchas</h2>
              <ul className="divide-y divide-[#E3E3E3] overflow-hidden rounded-2xl bg-white">
                {misCanchas.map((c) => (
                  <li key={c.id}>
                    <Link href={`/panel/c/${c.id}`} className="flex items-center justify-between p-4 text-sm transition hover:bg-[#FAFAFA]">
                      <span>
                        <span className="block font-bold">{c.nombre}</span>
                        <span className="text-[#5A5A5A]">{c.distrito}</span>
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          c.activa ? "bg-[#EDE9FE] text-[#6D28D9]" : "bg-[#F4F4F4] text-[#5A5A5A]"
                        }`}
                      >
                        {c.activa ? "Publicada" : "Pausada"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </Aparece>
        )}
      </main>
    </div>
  );
}

function Dato({ valor, etiqueta, resaltar, href }: { valor: number; etiqueta: string; resaltar?: boolean; href?: string }) {
  const contenido = (
    <>
      <p className={`text-2xl font-extrabold ${resaltar ? "text-amber-600" : "text-[#1B1B1B]"}`}>{valor}</p>
      <p className="text-xs text-[#5A5A5A]">{etiqueta}</p>
    </>
  );
  const clases = "block rounded-2xl bg-white p-3 text-center shadow-sm transition";
  return href ? (
    <Link href={href} className={`${clases} hover:-translate-y-0.5 hover:shadow-md`}>
      {contenido}
    </Link>
  ) : (
    <div className={`${clases} ${resaltar ? "ring-2 ring-amber-200" : ""}`}>{contenido}</div>
  );
}

type Paso = { hecho: boolean; titulo: string; detalle?: string; href?: string; accion?: string };

/** "Empieza a recibir reservas": pasos con barra de avance y el siguiente paso destacado. */
function GuiaPrimerosPasos({ pasos }: { pasos: Paso[] }) {
  const listos = pasos.filter((p) => p.hecho).length;
  const siguiente = pasos.findIndex((p) => !p.hecho);
  const avance = Math.round((listos / pasos.length) * 100);
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-bold">Empieza a recibir reservas</h2>
          <p className="text-xs text-[#5A5A5A]">
            {listos} de {pasos.length} pasos listos
          </p>
        </div>
        <span className="text-2xl font-extrabold text-[#6D28D9]">{avance}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#EDE9FE]" role="progressbar" aria-valuenow={avance} aria-valuemin={0} aria-valuemax={100}>
        <div className="boton-morado h-full rounded-full transition-[width] duration-700" style={{ width: `${avance}%` }} />
      </div>
      <ol className="flex flex-col gap-3">
        {pasos.map((p, i) => {
          const esSiguiente = i === siguiente;
          return (
            <li
              key={p.titulo}
              className={`flex items-start gap-3 rounded-xl p-2 transition ${esSiguiente ? "bg-[#F5F3FF] ring-1 ring-[#DDD6FE]" : ""}`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  p.hecho
                    ? "bg-[#DCF5EA] text-[#0F7A55]"
                    : esSiguiente
                      ? "bg-[#6D28D9] text-white"
                      : "bg-[#F4F4F4] text-[#8A8A8A]"
                }`}
                aria-hidden="true"
              >
                {p.hecho ? "✓" : i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div>
                  <p className={`text-sm font-bold ${p.hecho ? "text-[#8A968F] line-through decoration-1" : "text-[#1B1B1B]"}`}>
                    {p.titulo}
                  </p>
                  {!p.hecho && p.detalle && <p className="text-xs text-[#5A5A5A]">{p.detalle}</p>}
                </div>
                {esSiguiente && p.href && p.accion && (
                  <Link
                    href={p.href}
                    className="boton-morado self-start rounded-xl px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:brightness-110"
                  >
                    {p.accion} →
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Saldo para recibir reservas (S/ 1 por reserva confirmada). Al empezar, es el bono de bienvenida. */
function TarjetaSaldo({ saldo, soloBono, bono }: { saldo: SaldoPanel; soloBono: boolean; bono: number }) {
  const quedan = saldo.reservas_disponibles;
  const precio = soles(Number(saldo.precio_reserva));
  const reservas = `${quedan} reserva${quedan === 1 ? "" : "s"}`;

  // Se acabó el saldo: las canchas no reciben reservas
  if (quedan === 0) {
    return (
      <Link href="/panel/saldo" className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm transition hover:shadow-md">
        <span className="min-w-0">
          <span className="block text-xs text-[#5A5A5A]">{soloBono ? "Usaste tu bono de bienvenida" : "Saldo para reservas"}</span>
          <span className="block text-xl font-extrabold text-[#1B1B1B]">{soles(Number(saldo.saldo))}</span>
          <span className="block text-xs font-bold text-red-700">Tus canchas no reciben reservas. Recarga para seguir.</span>
        </span>
        <span className="boton-morado shrink-0 rounded-xl px-4 py-2 text-sm font-bold text-white">Recargar</span>
      </Link>
    );
  }

  // Todavía es el regalo de bienvenida
  if (soloBono) {
    return (
      <Link
        href="/panel/saldo"
        className="relative flex items-center justify-between gap-3 overflow-hidden rounded-2xl border border-[#DDD6FE] bg-gradient-to-br from-[#F5F3FF] via-white to-[#ECFDF5] p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      >
        <span className="min-w-0">
          <span className="inline-flex items-center gap-1 rounded-full bg-[#6D28D9] px-2.5 py-0.5 text-[11px] font-bold text-white">
            🎁 Bono de bienvenida
          </span>
          <span className="mt-1.5 block text-xl font-extrabold text-[#1B1B1B]">
            {soles(Number(saldo.saldo))} <span className="text-sm font-medium text-[#5A5A5A]">· {reservas} gratis</span>
          </span>
          <span className="block text-xs text-[#5A5A5A]">
            Te regalamos {soles(bono)} para tus primeras reservas. Solo se descuenta {precio} cuando confirmas el pago de una
            reserva.
          </span>
        </span>
        <span className="shrink-0 rounded-xl border border-[#6D28D9] bg-white px-3 py-2 text-xs font-bold text-[#6D28D9]">Ver saldo</span>
      </Link>
    );
  }

  const pocas = quedan <= 3;
  return (
    <Link
      href="/panel/saldo"
      className={`flex items-center justify-between gap-3 rounded-2xl border p-4 shadow-sm transition hover:shadow-md ${
        pocas ? "border-amber-200 bg-amber-50" : "border-transparent bg-white"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-xs text-[#5A5A5A]">Saldo para reservas</span>
        <span className="block text-xl font-extrabold text-[#1B1B1B]">
          {soles(Number(saldo.saldo))} <span className="text-sm font-medium text-[#5A5A5A]">· {reservas}</span>
        </span>
        {pocas ? (
          <span className="block text-xs font-bold text-amber-800">Te quedan pocas reservas. Recarga pronto.</span>
        ) : (
          <span className="block text-xs text-[#5A5A5A]">Se descuenta {precio} por cada reserva confirmada.</span>
        )}
      </span>
      <span className="boton-morado shrink-0 rounded-xl px-4 py-2 text-sm font-bold text-white">Recargar</span>
    </Link>
  );
}

function Atajo({ href, icono, titulo, detalle }: { href: string; icono: string; titulo: string; detalle: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
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
