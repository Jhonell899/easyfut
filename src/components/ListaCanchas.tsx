"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmtFecha, hoyLima, sumarDias } from "@/lib/horario";
import TarjetaCancha, { DEPORTES, type Cancha, type Confianza } from "@/components/TarjetaCancha";
import { distanciaKm, puntoDe, useMiUbicacion } from "@/lib/ubicacion";

type Filtro = { clave: string; texto: string; cumple: (c: Cancha) => boolean };

const HORAS_BUSQUEDA = Array.from({ length: 18 }, (_, i) => `${String(i + 6).padStart(2, "0")}:00`);
const TAMANO_PAGINA = 18;

const DISTRITOS_POPULARES = [
  "Ate", "Barranco", "Breña", "Carabayllo", "Chorrillos", "Comas", "El Agustino",
  "Independencia", "Jesús María", "La Molina", "La Victoria", "Lima Cercado", "Lince",
  "Los Olivos", "Lurigancho-Chosica", "Lurín", "Magdalena del Mar", "Miraflores",
  "Pueblo Libre", "Puente Piedra", "Rímac", "San Borja", "San Isidro", "San Juan de Lurigancho",
  "San Juan de Miraflores", "San Luis", "San Martín de Porres", "San Miguel",
  "Santa Anita", "Santiago de Surco", "Surquillo", "Villa El Salvador", "Villa María del Triunfo"
];

export default function ListaCanchas({
  canchas: canchasIniciales,
  confianza: confianzaInicial = {},
}: {
  canchas: Cancha[];
  confianza?: Record<string, Confianza>;
}) {
  const [canchas, setCanchas] = useState<Cancha[]>(canchasIniciales);
  const [confianza, setConfianza] = useState<Record<string, Confianza>>(confianzaInicial);
  const [activo, setActivo] = useState("todas");
  const [buscar, setBuscar] = useState("");
  const [distrito, setDistrito] = useState("");
  const [orden, setOrden] = useState<"recomendado" | "precio">("recomendado");
  const { punto, estado, pedir } = useMiUbicacion();

  // Paginación y búsqueda remota
  const [cargandoMas, setCargandoMas] = useState(false);
  const [hayMas, setHayMas] = useState(canchasIniciales.length >= 15);
  const [pagina, setPagina] = useState(1);

  // "¿Cuándo juegas?": canchas con un turno libre a esa hora
  const hoy = hoyLima();
  const [dia, setDia] = useState(hoy);
  const [hora, setHora] = useState("");
  const [libres, setLibres] = useState<Record<string, string> | null>(null);
  const [buscandoLibres, setBuscandoLibres] = useState(false);
  const [errorLibres, setErrorLibres] = useState(false);

  // Consulta remota de canchas libres
  useEffect(() => {
    if (!hora || !supabase) {
      setLibres(null);
      return;
    }
    let cancelado = false;
    setBuscandoLibres(true);
    setErrorLibres(false);
    supabase.rpc("canchas_libres", { p_fecha: dia, p_hora: hora }).then(({ data, error }) => {
      if (cancelado) return;
      setBuscandoLibres(false);
      if (error) {
        setErrorLibres(true);
        return setLibres(null);
      }
      const mapa: Record<string, string> = {};
      for (const f of (data ?? []) as { cancha_id: string; inicio: string }[])
        mapa[f.cancha_id] = fmtFecha(f.inicio, { hour: "2-digit", minute: "2-digit", hour12: false });
      setLibres(mapa);
    });
    return () => {
      cancelado = true;
    };
  }, [dia, hora]);

  // Si se busca un distrito específico o texto y no hay canchas suficientes en memoria, consultar a Supabase
  const buscarRemoto = useCallback(async (termino: string, dist: string) => {
    if (!supabase) return;
    try {
      let query = supabase
        .from("canchas")
        .select("*, franjas(precio_hora)")
        .eq("activa", true);

      if (dist) {
        query = query.eq("distrito", dist);
      }
      if (termino.trim()) {
        const t = termino.trim();
        query = query.or(`nombre.ilike.%${t}%,direccion.ilike.%${t}%,distrito.ilike.%${t}%`);
      }

      query = query.order("created_at", { ascending: false }).limit(TAMANO_PAGINA);

      const { data } = await query;
      if (data && data.length > 0) {
        const nuevas = data as Cancha[];
        setCanchas((prev) => {
          const mapa = new Map(prev.map((c) => [c.id, c]));
          nuevas.forEach((n) => mapa.set(n.id, n));
          return Array.from(mapa.values());
        });

        // Obtener datos de confianza si aplica
        const faltanConfianza = nuevas.filter((n) => !confianza[n.id]).map((n) => n.id);
        if (faltanConfianza.length > 0) {
          const { data: filas } = await supabase.rpc("confianza_canchas", { p_ids: faltanConfianza });
          if (filas) {
            setConfianza((prev) => {
              const copia = { ...prev };
              for (const f of filas as (Confianza & { cancha_id: string })[]) copia[f.cancha_id] = f;
              return copia;
            });
          }
        }
      }
    } catch {}
  }, [confianza]);

  // Debounce para búsqueda remota cuando el usuario escribe
  const busquedaTimer = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (busquedaTimer.current) clearTimeout(busquedaTimer.current);
    if (buscar.trim().length >= 3 || distrito) {
      busquedaTimer.current = setTimeout(() => {
        buscarRemoto(buscar, distrito);
      }, 400);
    }
    return () => {
      if (busquedaTimer.current) clearTimeout(busquedaTimer.current);
    };
  }, [buscar, distrito, buscarRemoto]);

  // Cargar más canchas (paginación escalable)
  async function cargarMas() {
    if (!supabase || cargandoMas || !hayMas) return;
    setCargandoMas(true);
    const desde = pagina * TAMANO_PAGINA;
    const hasta = desde + TAMANO_PAGINA - 1;

    let query = supabase
      .from("canchas")
      .select("*, franjas(precio_hora)")
      .eq("activa", true)
      .order("created_at", { ascending: false })
      .range(desde, hasta);

    if (distrito) query = query.eq("distrito", distrito);

    const { data, error } = await query;
    setCargandoMas(false);
    if (error || !data || data.length === 0) {
      setHayMas(false);
      return;
    }

    if (data.length < TAMANO_PAGINA) setHayMas(false);
    setPagina((p) => p + 1);

    const nuevas = data as Cancha[];
    setCanchas((prev) => {
      const mapa = new Map(prev.map((c) => [c.id, c]));
      nuevas.forEach((n) => mapa.set(n.id, n));
      return Array.from(mapa.values());
    });

    const faltanConfianza = nuevas.filter((n) => !confianza[n.id]).map((n) => n.id);
    if (faltanConfianza.length > 0) {
      const { data: filas } = await supabase.rpc("confianza_canchas", { p_ids: faltanConfianza });
      if (filas) {
        setConfianza((prev) => {
          const copia = { ...prev };
          for (const f of filas as (Confianza & { cancha_id: string })[]) copia[f.cancha_id] = f;
          return copia;
        });
      }
    }
  }

  // Lista combinada de distritos
  const distritos = useMemo(() => {
    const existentes = canchas.map((c) => c.distrito);
    return [...new Set([...existentes, ...DISTRITOS_POPULARES])].filter(Boolean).sort((a, b) => a.localeCompare(b, "es"));
  }, [canchas]);

  const precioDesde = (c: Cancha) => {
    const p = (c.franjas ?? []).map((f) => Number(f.precio_hora));
    return p.length ? Math.min(...p) : Infinity;
  };

  const plano = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const filtros = useMemo<Filtro[]>(() => {
    const modalidades = [...new Set(canchas.flatMap((c) => c.modalidades ?? []))].sort((a, b) => a - b);
    const otrosDeportes = [...new Set(canchas.map((c) => c.deporte))].filter((d) => d !== "futbol");

    return [
      { clave: "todas", texto: "Todas", cumple: () => true },
      ...modalidades.map((n) => ({
        clave: `f${n}`,
        texto: `Fútbol ${n}`,
        cumple: (c: Cancha) => (c.modalidades ?? []).includes(n),
      })),
      ...otrosDeportes.map((d) => ({
        clave: d,
        texto: DEPORTES[d] ?? d,
        cumple: (c: Cancha) => c.deporte === d,
      })),
    ];
  }, [canchas]);

  const filtro = filtros.find((f) => f.clave === activo) ?? filtros[0];

  const visibles = useMemo(() => {
    const q = plano(buscar.trim());
    const lista = canchas
      .filter(filtro.cumple)
      .filter((c) => !distrito || c.distrito === distrito)
      .filter((c) => !q || plano(`${c.nombre} ${c.distrito} ${c.direccion}`).includes(q))
      .filter((c) => !libres || c.id in libres)
      .map((c) => {
        const p = puntoDe(c);
        return { c, km: punto && p ? distanciaKm(punto, p) : null };
      });
    if (orden === "precio") lista.sort((a, b) => precioDesde(a.c) - precioDesde(b.c));
    else if (punto) lista.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
    return lista;
  }, [canchas, filtro, punto, buscar, distrito, orden, libres]);

  const hayFiltros = !!buscar.trim() || !!distrito || activo !== "todas" || !!hora;

  function limpiarFiltros() {
    setBuscar("");
    setDistrito("");
    setActivo("todas");
    setHora("");
  }

  return (
    <>
      <div className="sombra-fuerte flex flex-col gap-3 rounded-3xl bg-white p-4 sm:p-5 transition-all">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-[#1B1B1B]">Canchas en Lima</h2>
            {hayFiltros && (
              <span className="rounded-full bg-[#EDE9FE] px-2 py-0.5 text-xs font-semibold text-[#6D28D9]">
                Filtros activos
              </span>
            )}
          </div>
          <span className="text-sm font-medium text-[#5A5A5A]">
            {visibles.length} {visibles.length === 1 ? "cancha" : "canchas"}
          </span>
        </div>

        {/* Buscador interactivo con botón de limpiar */}
        <div className="relative flex items-center rounded-2xl border border-[#E3E3E3] bg-[#FAFAFA] px-3 focus-within:border-[#6D28D9] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#6D28D9]/20 transition-all">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8A968F" strokeWidth="2" aria-hidden="true" className="shrink-0">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Busca por nombre, distrito o dirección..."
            aria-label="Buscar canchas"
            className="min-w-0 flex-1 bg-transparent py-2.5 px-2 text-sm sm:text-base outline-none placeholder:text-[#8A968F]"
          />
          {buscar && (
            <button
              type="button"
              onClick={() => setBuscar("")}
              aria-label="Limpiar búsqueda"
              className="rounded-full p-1 text-[#8A968F] hover:bg-[#E3E3E3] hover:text-[#1B1B1B]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Selectores distrito y orden */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="relative">
            <select
              value={distrito}
              onChange={(e) => setDistrito(e.target.value)}
              aria-label="Distrito"
              className="w-full appearance-none rounded-xl border border-[#E3E3E3] bg-white px-3 py-2.5 pr-8 text-sm outline-none focus:border-[#6D28D9] focus:ring-2 focus:ring-[#6D28D9]/20 transition-all"
            >
              <option value="">Todos los distritos</option>
              {distritos.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#8A968F]">▼</span>
          </div>

          <div className="relative">
            <select
              value={orden}
              onChange={(e) => setOrden(e.target.value as typeof orden)}
              aria-label="Ordenar"
              className="w-full appearance-none rounded-xl border border-[#E3E3E3] bg-white px-3 py-2.5 pr-8 text-sm outline-none focus:border-[#6D28D9] focus:ring-2 focus:ring-[#6D28D9]/20 transition-all"
            >
              <option value="recomendado">{punto ? "Más cerca primero" : "Más recientes"}</option>
              <option value="precio">Menor precio por hora</option>
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#8A968F]">▼</span>
          </div>
        </div>

        {/* ¿Cuándo juegas? */}
        <div className="flex flex-col gap-2 rounded-2xl bg-[#F5F3FF] p-3 ring-1 ring-[#C4B5FD]/40">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-[#4C1D95]">¿Cuándo quieres jugar?</p>
            {hora && (
              <button
                type="button"
                onClick={() => setHora("")}
                className="text-[11px] font-bold text-[#6D28D9] hover:underline"
              >
                Cualquier hora
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {[
              { valor: hoy, texto: "Hoy" },
              { valor: sumarDias(hoy, 1), texto: "Mañana" },
            ].map((d) => (
              <button
                key={d.valor}
                type="button"
                onClick={() => setDia(d.valor)}
                aria-pressed={dia === d.valor}
                className={`rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                  dia === d.valor
                    ? "bg-[#6D28D9] text-white shadow-sm"
                    : "bg-white text-[#4C1D95] ring-1 ring-[#C4B5FD]/60 hover:bg-[#EDE9FE]"
                }`}
              >
                {d.texto}
              </button>
            ))}
            <div className="relative min-w-0 flex-1">
              <select
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                aria-label="Hora de juego"
                className="w-full appearance-none rounded-xl border border-[#C4B5FD] bg-white px-3 py-2 pr-7 text-xs font-bold text-[#4C1D95] outline-none focus:ring-2 focus:ring-[#6D28D9]/20"
              >
                <option value="">A cualquier hora</option>
                {HORAS_BUSQUEDA.map((h) => (
                  <option key={h} value={h}>
                    A las {h}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-[#4C1D95]">▼</span>
            </div>
          </div>
          {hora && (
            <p className="text-xs text-[#4C1D95]">
              {buscandoLibres
                ? "Buscando canchas libres…"
                : errorLibres
                  ? "Esta búsqueda aún no está disponible."
                  : `${Object.keys(libres ?? {}).length} cancha${Object.keys(libres ?? {}).length === 1 ? "" : "s"} libre${
                      Object.keys(libres ?? {}).length === 1 ? "" : "s"
                    } ${dia === hoy ? "hoy" : "mañana"} entre las ${hora} y las ${String(Number(hora.slice(0, 2)) + 1).padStart(2, "0")}:00`}
            </p>
          )}
        </div>

        {/* Ubicación cercana */}
        <BotonUbicacion estado={estado} onPedir={pedir} />

        {/* Filtros por modalidad / deporte */}
        {filtros.length > 1 && (
          <div
            className="sin-scroll -mx-4 flex gap-2 overflow-x-auto px-4 pt-1"
            role="group"
            aria-label="Filtrar por tipo de cancha"
          >
            {filtros.map((f) => {
              const sel = f.clave === filtro.clave;
              return (
                <button
                  key={f.clave}
                  type="button"
                  onClick={() => setActivo(f.clave)}
                  aria-pressed={sel}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-all ${
                    sel
                      ? "border-[#0A3D2E] bg-[#0A3D2E] text-white shadow-sm"
                      : "border-[#E3E3E3] bg-white text-[#1B1B1B] hover:border-[#6D28D9] hover:text-[#6D28D9]"
                  }`}
                >
                  {f.texto}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Listado de tarjetas de cancha */}
      <div className="flex flex-col gap-4">
        {visibles.map(({ c, km }) => (
          <TarjetaCancha key={c.id} cancha={c} km={km} confianza={confianza[c.id]} libre={libres?.[c.id]} />
        ))}
      </div>

      {/* Botón para cargar más canchas (paginación escalable) */}
      {hayMas && visibles.length > 0 && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={cargarMas}
            disabled={cargandoMas}
            className="flex items-center gap-2 rounded-2xl border-2 border-[#0A3D2E] bg-white px-6 py-3 text-sm font-extrabold text-[#0A3D2E] shadow-sm transition-all hover:bg-[#0A3D2E] hover:text-white disabled:opacity-50"
          >
            {cargandoMas ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Cargando más canchas…
              </>
            ) : (
              "Ver más canchas"
            )}
          </button>
        </div>
      )}

      {/* Estado vacío cuando no hay resultados */}
      {visibles.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl bg-white p-8 text-center sombra-suave">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EDE9FE] text-[#6D28D9]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-[#1B1B1B]">No encontramos canchas disponibles</h3>
          <p className="max-w-xs text-xs text-[#5A5A5A]">
            No hay canchas que coincidan con tus filtros actuales. Intenta cambiar de distrito o limpiar los filtros.
          </p>
          {hayFiltros && (
            <button
              type="button"
              onClick={limpiarFiltros}
              className="mt-2 rounded-xl bg-[#6D28D9] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#5B21B6] transition-colors"
            >
              Restablecer filtros
            </button>
          )}
        </div>
      )}
    </>
  );
}

function BotonUbicacion({ estado, onPedir }: { estado: ReturnType<typeof useMiUbicacion>["estado"]; onPedir: () => void }) {
  if (estado === "listo") {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-[#EDE9FE] px-3 py-2 text-xs font-semibold text-[#6D28D9]">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span className="flex-1 truncate">Ordenadas por cercanía a tu ubicación</span>
        <button type="button" onClick={onPedir} className="font-bold underline underline-offset-2 hover:opacity-80">
          Actualizar
        </button>
      </div>
    );
  }

  const mensaje =
    estado === "denegado"
      ? "Bloqueaste la ubicación. Puedes activarla en el candado de la barra de direcciones."
      : estado === "error"
        ? "No pudimos obtener tu ubicación. Inténtalo de nuevo."
        : estado === "no-soportado"
          ? "Tu navegador no permite compartir la ubicación."
          : null;

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={onPedir}
        disabled={estado === "buscando" || estado === "no-soportado"}
        className="flex items-center justify-center gap-2 rounded-xl border border-[#6D28D9] py-2 text-xs font-bold text-[#6D28D9] transition-all hover:bg-[#EDE9FE] disabled:opacity-60 active:scale-[0.99]"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M3 11l18-8-8 18-2-8-8-2z" />
        </svg>
        {estado === "buscando" ? "Buscando tu ubicación…" : "Ver canchas más cercanas"}
      </button>
      {mensaje && <p className="text-[11px] text-[#5A5A5A]">{mensaje}</p>}
    </div>
  );
}
