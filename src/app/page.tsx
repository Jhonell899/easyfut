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
        .select("*, franjas(precio_hora)") // "*" incluye modalidades si la columna ya existe
        .eq("activa", true)
        .order("created_at", { ascending: false })
        .limit(30)
    : { data: null, error: null };

  const canchas = (data ?? []) as Cancha[];

  // Reseñas, partidos jugados y dueño verificado (migración 017; si no existe, se omite)
  const confianza: Record<string, Confianza> = {};
  if (supabase && canchas.length) {
    const { data: filas } = await supabase.rpc("confianza_canchas", { p_ids: canchas.map((c) => c.id) });
    for (const f of (filas ?? []) as (Confianza & { cancha_id: string })[]) confianza[f.cancha_id] = f;
  }

  return (
    <div className="min-h-screen">
      {/* Portada */}
      <header className="fondo-cancha relative overflow-hidden rounded-b-[2rem] text-white">
        <div className="relative mx-auto flex max-w-xl flex-col gap-7 px-5 pb-20 pt-5">
          <nav className="flex items-center justify-between">
            <Logo claro />
            <MenuUsuario claro />
          </nav>
          <div className="flex flex-col gap-3">
            <span className="self-start rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-[#C4B5FD] ring-1 ring-white/20 backdrop-blur">
              ⚽ Canchas en Lima
            </span>
            <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight">
              Reserva tu cancha
              <br />
              <span className="bg-gradient-to-r from-[#C4B5FD] to-[#A7F3D0] bg-clip-text text-transparent">en minutos</span>
            </h1>
            <p className="max-w-xs text-white/75">Elige horario, paga con Yape o Plin y juega. Sin llamadas ni esperas.</p>
          </div>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              { valor: String(canchas.length), texto: canchas.length === 1 ? "cancha" : "canchas" },
              { valor: "1 min", texto: "para reservar" },
              { valor: "24/7", texto: "desde tu celular" },
            ].map((d) => (
              <div key={d.texto} className="rounded-2xl bg-white/10 px-2 py-2.5 ring-1 ring-white/15 backdrop-blur">
                <dd className="text-xl font-extrabold">{d.valor}</dd>
                <dt className="text-[11px] text-white/70">{d.texto}</dt>
              </div>
            ))}
          </dl>
        </div>
      </header>

      <main className="relative mx-auto -mt-12 flex max-w-xl flex-col gap-5 px-5 pb-10">
        {!supabase && <AvisoConfig />}

        {error && (
          <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
            No pudimos cargar las canchas. Inténtalo de nuevo en unos minutos.
          </p>
        )}

        {supabase && !error && canchas.length === 0 && (
          <p className="rounded-xl bg-white p-4 text-sm text-[#4A5A52]">
            Pronto tendremos canchas en tu zona.
          </p>
        )}

        {canchas.length > 0 && <ListaCanchas canchas={canchas} confianza={confianza} />}

        {/* Entrada para dueños de canchas */}
        <Link
          href="/publicar"
          className="fondo-cancha sombra-fuerte mt-4 flex items-center gap-4 rounded-3xl p-5 text-white transition-transform hover:-translate-y-0.5"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#C4B5FD] text-[#6D28D9]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M3 21V9l9-6 9 6v12h-6v-7H9v7z" />
            </svg>
          </span>
          <span className="flex-1">
            <span className="block font-bold">¿Tienes una cancha?</span>
            <span className="block text-sm text-white/70">Publícala en EasyFut y recibe reservas en línea.</span>
          </span>
          <span aria-hidden="true" className="text-xl text-[#C4B5FD]">→</span>
        </Link>
      </main>

      <footer className="flex flex-col items-center gap-1 pb-8 text-center text-xs text-[#8A968F]">
        <p className="flex gap-4">
          <Link href="/terminos" className="hover:underline">
            Términos
          </Link>
          <Link href="/privacidad" className="hover:underline">
            Privacidad
          </Link>
          <Link href="/publicar" className="hover:underline">
            Publica tu cancha
          </Link>
          <a href="mailto:easyfutinquiries@gmail.com" className="hover:underline">
            Soporte
          </a>
        </p>
        <p>© {new Date().getFullYear()} EasyFut</p>
      </footer>
    </div>
  );
}
