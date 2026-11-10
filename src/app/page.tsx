import Link from "next/link";
import MenuUsuario from "@/components/MenuUsuario";
import { supabase } from "@/lib/supabase";
import { type Cancha } from "@/components/TarjetaCancha";
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

  return (
    <div className="min-h-screen">
      {/* Portada */}
      <header className="fondo-cancha relative overflow-hidden text-white">
        <div className="relative mx-auto flex max-w-xl flex-col gap-8 px-5 pb-16 pt-5">
          <nav className="flex items-center justify-between">
            <Logo claro />
            <MenuUsuario claro />
          </nav>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-extrabold leading-tight">
              Reserva tu cancha
              <br />
              en minutos
            </h1>
            <p className="text-white/80">
              Elige horario, paga y juega. Sin llamadas ni esperas.
            </p>
          </div>
        </div>
      </header>

      <main className="relative mx-auto -mt-8 flex max-w-xl flex-col gap-4 px-5 pb-10">
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

        {canchas.length > 0 && <ListaCanchas canchas={canchas} />}

        {/* Entrada para dueños de canchas */}
        <Link
          href="/publicar"
          className="mt-4 flex items-center gap-4 rounded-2xl bg-[#1B1B1B] p-5 text-white transition-transform hover:-translate-y-0.5"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#B6F09C] text-[#0B6E4F]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M3 21V9l9-6 9 6v12h-6v-7H9v7z" />
            </svg>
          </span>
          <span className="flex-1">
            <span className="block font-bold">¿Tienes una cancha?</span>
            <span className="block text-sm text-white/70">Publícala en EasyFut y recibe reservas en línea.</span>
          </span>
          <span aria-hidden="true" className="text-xl text-[#B6F09C]">→</span>
        </Link>
      </main>

      <footer className="pb-8 text-center text-xs text-[#8A968F]">
        © {new Date().getFullYear()} EasyFut
      </footer>
    </div>
  );
}
