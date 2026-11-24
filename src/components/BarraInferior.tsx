"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";

// Solo en las pantallas principales: las demás ya tienen su propia barra de acción abajo
const RUTAS = ["/", "/reservas", "/panel", "/admin", "/publicar"];

type Cuenta = "anonimo" | "cliente" | "panel" | "admin" | "dueno-jugando";

/** Barra de navegación inferior, como en una app de celular. */
export default function BarraInferior() {
  const ruta = usePathname();
  const [cuenta, setCuenta] = useState<Cuenta>("anonimo");

  useEffect(() => {
    const supabase = supabaseNavegador();
    if (!supabase) return;
    async function cargar() {
      const { data } = await supabase!.auth.getUser();
      if (!data.user) return setCuenta("anonimo");
      const { data: p } = await supabase!.from("perfiles").select("*").eq("id", data.user.id).maybeSingle();
      if (p?.es_admin) return setCuenta("admin");
      if (p?.rol === "dueno")
        return setCuenta(/(?:^|; )ef_modo=jugador/.test(document.cookie) ? "dueno-jugando" : "panel");
      const { data: locales } = await supabase!.rpc("mis_locales");
      setCuenta(Array.isArray(locales) && locales.length > 0 ? "panel" : "cliente");
    }
    cargar();
    const { data: sub } = supabase.auth.onAuthStateChange(() => cargar());
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!RUTAS.includes(ruta)) return null;

  const tercero =
    cuenta === "dueno-jugando"
      ? { href: "/modo?m=dueno", texto: "Modo dueño", icono: <path d="M7 7h11l-3-3M17 17H6l3 3" /> }
      : cuenta === "admin"
      ? { href: "/admin", texto: "Admin", icono: <path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z" /> }
      : cuenta === "panel"
        ? {
            href: "/panel",
            texto: "Mi panel",
            icono: (
              <>
                <rect x="3" y="3" width="7" height="9" rx="1.5" />
                <rect x="14" y="3" width="7" height="5" rx="1.5" />
                <rect x="14" y="12" width="7" height="9" rx="1.5" />
                <rect x="3" y="16" width="7" height="5" rx="1.5" />
              </>
            ),
          }
        : cuenta === "cliente"
          ? { href: "/publicar", texto: "Publicar", icono: <path d="M12 5v14M5 12h14" /> }
          : {
              href: "/ingresar",
              texto: "Ingresar",
              icono: (
                <>
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
                </>
              ),
            };

  const items = [
    { href: "/", texto: "Canchas", icono: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /> },
    {
      href: "/reservas",
      texto: "Mis reservas",
      icono: (
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </>
      ),
    },
    tercero,
  ];

  return (
    <>
      <div className="h-20 md:hidden" aria-hidden="true" />
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-[#E3E3E3] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto grid max-w-xl grid-cols-3">
          {items.map((i) => {
            const activo = i.href === ruta;
            return (
              <li key={i.href}>
                <Link
                  href={i.href}
                  aria-current={activo ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold ${
                    activo ? "text-[#16A34A]" : "text-slate-400"
                  }`}
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={activo ? 2.4 : 1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    {i.icono}
                  </svg>
                  {i.texto}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
