import Link from "next/link";
import MenuUsuario from "@/components/MenuUsuario";
import { supabase } from "@/lib/supabase";
import { type Cancha, type Confianza } from "@/components/TarjetaCancha";
import ListaCanchas from "@/components/ListaCanchas";
import AvisoConfig from "@/components/AvisoConfig";
import Logo from "@/components/Logo";

// La página se regenera como máximo cada 60 segundos
export const revalidate = 60;

export default async function Inicio() {
  const { data, error } = supabase
    ? await supabase
        .from("canchas")
        .select("*, franjas:tarifas_horarias(precio_hora)")
        .eq("activa", true)
        .order("created_at", { ascending: false })
        .limit(18)
    : { data: null, error: null };

  const canchas = (data ?? []) as Cancha[];

  // Reseñas, partidos jugados y dueño verificado
  const confianza: Record<string, Confianza> = {};
  if (supabase && canchas.length) {
    const { data: filas } = await supabase.rpc("confianza_canchas", { p_ids: canchas.map((c) => c.id) });
    for (const f of (filas ?? []) as (Confianza & { cancha_id: string })[]) confianza[f.cancha_id] = f;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      {/* Portada Deportiva de Alto Impacto */}
      <header className="fondo-cancha relative overflow-hidden rounded-b-[2.5rem] text-white shadow-xl">
        <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:px-6 lg:px-8 pb-20 pt-6 sm:pb-24">
          {/* Navegación Superior */}
          <nav className="flex items-center justify-between">
            <Logo claro />

            {/* Enlaces Desktop */}
            <div className="hidden md:flex items-center gap-6 text-sm font-semibold text-white/90">
              <Link href="/" className="hover:text-violet-400 transition-colors">
                Canchas
              </Link>
              <Link href="/reservas" className="hover:text-violet-400 transition-colors">
                Mis Reservas
              </Link>
              <Link
                href="/publicar"
                className="rounded-full bg-white/10 px-4 py-2 hover:bg-white/20 transition-all border border-white/20"
              >
                ¿Tienes una cancha?
              </Link>
            </div>

            <MenuUsuario claro />
          </nav>

          {/* Hero Content */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 pt-4">
            <div className="flex max-w-xl flex-col gap-4">
              <span className="self-start rounded-full bg-violet-500/20 px-3.5 py-1 text-xs font-bold text-violet-300 ring-1 ring-violet-400/30 backdrop-blur-md flex items-center gap-1.5">
                <span>⚽</span> Fútbol en Lima
              </span>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.08] tracking-tight">
                Reserva tu cancha
                <br />
                <span className="bg-gradient-to-r from-violet-400 via-violet-200 to-fuchsia-200 bg-clip-text text-transparent">
                  en minutos
                </span>
              </h1>
              <p className="max-w-md text-sm sm:text-base text-slate-200 font-normal">
                Encuentra tu horario ideal, paga directo con Yape o Plin y juega con tu equipo sin llamadas ni esperas.
              </p>
            </div>

            {/* Métricas / Badges en desktop */}
            <dl className="grid grid-cols-3 gap-2.5 sm:gap-3 text-center w-full md:w-auto md:min-w-[340px]">
              {[
                { valor: String(canchas.length), texto: canchas.length === 1 ? "cancha activa" : "canchas activas" },
                { valor: "1 min", texto: "para reservar" },
                { valor: "24/7", texto: "disponibilidad" },
              ].map((d) => (
                <div key={d.texto} className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/15 backdrop-blur-md">
                  <dd className="text-xl sm:text-2xl font-black text-violet-300">{d.valor}</dd>
                  <dt className="text-[11px] sm:text-xs text-slate-300 font-medium">{d.texto}</dt>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </header>

      {/* Contenedor Principal Responsive */}
      <main className="relative mx-auto -mt-10 sm:-mt-12 flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 sm:px-6 lg:px-8 pb-16">
        {!supabase && <AvisoConfig />}

        {error && (
          <p className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700 border border-red-200">
            No pudimos conectar con la base de datos de canchas. Inténtalo de nuevo en unos minutos.
          </p>
        )}

        {/* El buscador aparece siempre, haya o no canchas publicadas */}
        {supabase && !error && <ListaCanchas canchas={canchas} confianza={confianza} />}

        {/* Banner para dueños de canchas (Responsive Desktop & Mobile) */}
        <div className="fondo-cancha sombra-fuerte mt-6 rounded-3xl p-6 sm:p-8 text-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-500/20 text-violet-400 border border-violet-400/30">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M3 21V9l9-6 9 6v12h-6v-7H9v7z" />
                </svg>
              </span>
              <div>
                <h3 className="text-xl font-extrabold">¿Tienes una cancha o complejo deportivo?</h3>
                <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
                  Publica tus canchas gratis en EasyFut, automatiza tus horarios y recibe reservas verificadas las 24 horas del día.
                </p>
              </div>
            </div>

            <Link
              href="/publicar"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-500 hover:bg-violet-400 text-slate-950 font-black px-6 py-3.5 text-sm transition-all shadow-lg active:scale-95 shrink-0"
            >
              Publicar mi cancha
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </main>

      {/* Footer Responsive */}
      <footer className="border-t border-slate-200/80 bg-white py-8 text-center text-xs text-slate-500 mt-auto">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo />
          <div className="flex flex-wrap items-center gap-5 font-medium text-slate-600">
            <Link href="/terminos" className="hover:text-violet-600 transition-colors">
              Términos
            </Link>
            <Link href="/privacidad" className="hover:text-violet-600 transition-colors">
              Privacidad
            </Link>
            <Link href="/publicar" className="hover:text-violet-600 transition-colors">
              Publica tu cancha
            </Link>
            <Link href="/reservas" className="hover:text-violet-600 transition-colors">
              Mis reservas
            </Link>
          </div>
          <p>© {new Date().getFullYear()} EasyFut · Plataforma de Reservas Deportivas</p>
        </div>
      </footer>
    </div>
  );
}
