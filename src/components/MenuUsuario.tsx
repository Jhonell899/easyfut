"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";

type PerfilMenu = { nombre: string | null; rol: "cliente" | "dueno"; es_admin?: boolean };

/** Botón "Ingresar" o el menú de la cuenta, según haya sesión. */
export default function MenuUsuario({ claro = false }: { claro?: boolean }) {
  const [estado, setEstado] = useState<"cargando" | "anonimo" | "conectado">("cargando");
  const [perfil, setPerfil] = useState<PerfilMenu | null>(null);
  const [correo, setCorreo] = useState("");
  const [esEncargado, setEsEncargado] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = supabaseNavegador();
    if (!supabase) return setEstado("anonimo");

    async function cargar() {
      const { data } = await supabase!.auth.getUser();
      if (!data.user) {
        setPerfil(null);
        return setEstado("anonimo");
      }
      setCorreo(data.user.email ?? "");
      const { data: p } = await supabase!
        .from("perfiles")
        .select("*") // "*" incluye es_admin si ya existe (migración 008)
        .eq("id", data.user.id)
        .maybeSingle();
      setPerfil((p as PerfilMenu) ?? { nombre: null, rol: "cliente" });
      // ¿Es encargado de algún local? (migración 011; si no existe, simplemente no)
      const { data: locales } = await supabase!.rpc("mis_locales");
      setEsEncargado(Array.isArray(locales) && locales.length > 0);
      setEstado("conectado");
    }

    cargar();
    const { data: sub } = supabase.auth.onAuthStateChange(() => cargar());
    return () => sub.subscription.unsubscribe();
  }, []);

  // Cerrar al tocar fuera
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("click", cerrar);
    return () => document.removeEventListener("click", cerrar);
  }, [abierto]);

  async function salir() {
    await supabaseNavegador()?.auth.signOut();
    window.location.assign("/");
  }

  const pastilla = claro
    ? "bg-white/15 text-white backdrop-blur hover:bg-white/25"
    : "bg-white text-[#1B1B1B] border border-[#E3E3E3]";

  if (estado === "cargando") {
    return <span className={`h-8 w-24 animate-pulse rounded-full ${claro ? "bg-white/15" : "bg-[#E3E3E3]"}`} />;
  }

  if (estado === "anonimo") {
    return (
      <div className="flex items-center gap-2">
        <Link href="/reservas" className={`rounded-full px-3 py-1.5 text-sm font-medium ${pastilla}`}>
          Mis reservas
        </Link>
        <Link
          href="/ingresar"
          className={`rounded-full px-4 py-1.5 text-sm font-bold ${
            claro ? "bg-white text-[#6D28D9]" : "bg-[#6D28D9] text-white"
          }`}
        >
          Ingresar
        </Link>
      </div>
    );
  }

  const nombre = perfil?.nombre?.trim() || correo.split("@")[0];
  const esDueno = perfil?.rol === "dueno";
  // Un dueño puede usar EasyFut como jugador (cookie "ef_modo", ver /modo)
  const modoJugador = esDueno && typeof document !== "undefined" && /(?:^|; )ef_modo=jugador/.test(document.cookie);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-haspopup="menu"
        className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-medium ${pastilla}`}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#C4B5FD] text-xs font-bold text-[#6D28D9]">
          {nombre.charAt(0).toUpperCase()}
        </span>
        <span className="max-w-24 truncate">{nombre.split(" ")[0]}</span>
      </button>

      {abierto && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-[#E3E3E3] bg-white text-sm text-[#1B1B1B] shadow-lg"
        >
          <div className="border-b border-[#E3E3E3] p-3">
            <p className="truncate font-bold">{nombre}</p>
            <p className="truncate text-xs text-[#5A5A5A]">{correo}</p>
            <span
              className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                esDueno ? "bg-[#0A3D2E] text-white" : "bg-[#EDE9FE] text-[#6D28D9]"
              }`}
            >
              {esDueno ? (modoJugador ? "Dueño · modo jugador" : "Dueño") : esEncargado ? "Encargado" : "Jugador"}
            </span>
          </div>
          {esDueno ? (
            modoJugador ? (
              <a href="/modo?m=dueno" role="menuitem" className="block px-3 py-2.5 font-bold text-[#6D28D9] hover:bg-[#F4F4F4]">
                ⇄ Volver a modo dueño
              </a>
            ) : (
              <>
                <Link href="/panel" role="menuitem" className="block px-3 py-2.5 hover:bg-[#F4F4F4]">
                  Mi panel
                </Link>
                <a href="/modo?m=jugador" role="menuitem" className="block px-3 py-2.5 hover:bg-[#F4F4F4]">
                  ⇄ Cambiar a modo jugador
                </a>
              </>
            )
          ) : esEncargado ? (
            <Link href="/panel" role="menuitem" className="block px-3 py-2.5 font-bold text-[#6D28D9] hover:bg-[#F4F4F4]">
              Panel de encargado
            </Link>
          ) : (
            <Link href="/publicar" role="menuitem" className="block px-3 py-2.5 hover:bg-[#F4F4F4]">
              ⇄ Tengo una cancha: ser dueño
            </Link>
          )}
          <Link href="/reservas" role="menuitem" className="block px-3 py-2.5 hover:bg-[#F4F4F4]">
            Mis reservas
          </Link>
          {perfil?.es_admin && (
            <Link href="/admin" role="menuitem" className="block px-3 py-2.5 font-bold text-[#6D28D9] hover:bg-[#F4F4F4]">
              Administración
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={salir}
            className="block w-full px-3 py-2.5 text-left text-red-700 hover:bg-[#F4F4F4]"
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
