"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fmtFecha, hoyLima, sumarDias } from "@/lib/horario";
import TarjetaCancha, { DEPORTES, type Cancha, type Confianza } from "@/components/TarjetaCancha";
import { distanciaKm, puntoDe, useMiUbicacion } from "@/lib/ubicacion";

type Filtro = { clave: string; texto: string; cumple: (c: Cancha) => boolean };

const HORAS_BUSQUEDA = Array.from({ length: 18 }, (_, i) => `${String(i + 6).padStart(2, "0")}:00`);
const TAMANO_PAGINA = 18;

/**
 * Texto seguro para el filtro de búsqueda de Supabase (.or). Solo deja letras, números,
 * espacios, guiones y apóstrofos: así nadie puede meter comas, paréntesis o puntos que
 * cambien las condiciones de la consulta (inyección en el filtro).
 */
function textoDeBusqueda(termino: string) {
  return termino
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

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
  const [hayMas, setHayMas] = useState(canchasIniciales.length >= 12);
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

  // Consulta remota a Supabase al buscar
  const buscarRemoto = useCallback(async (termino: string, dist: string) => {
    if (!supabase) return;
    try {
      let query = supabase
        .from("canchas")
        .select("*, franjas:tarifas_horarias(precio_hora)")
        .eq("activa", true);

      if (dist) query = query.eq("distrito", dist);
      const t = textoDeBusqueda(termino);
      if (t) {
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

  async function cargarMas() {
    if (!supabase || cargandoMas || !hayMas) return;
    setCargandoMas(true);
    const desde = pagina * TAMANO_PAGINA;
    const hasta = desde + TAMANO_PAGINA - 1;

    let query = supabase
      .from("canchas")
      .select("*, franjas:tarifas_horarias(precio_hora)")
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
  }

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
      { clave: "todas", texto: "Todas las canchas", cumple: () => true },
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
    <div className="flex flex-col gap-6">
      {/* Panel de Filtros y Búsqueda */}
      <div className="sombra-fuerte flex flex-col gap-4 rounded-3xl bg-white p-4 sm:p-6 border border-slate-100 transition-all">
        {/* Cabecera del filtro */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base sm:text-lg font-bold text-slate-900">Encuentra tu cancha</h2>
            {hayFiltros && (
              <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700 border border-violet-200">
                Filtros aplicados
              </span>
            )}
          </div>
          <span className="text-xs sm:text-sm font-semibold text-slate-500">
            {visibles.length} {visibles.length === 1 ? "cancha disponible" : "canchas disponibles"}
          </span>
        </div>

        {/* Buscador y selectores en desktop como fila integrada */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Campo de búsqueda */}
          <div className="lg:col-span-6 relative flex items-center rounded-2xl border border-slate-200 bg-slate-50/70 px-3.5 focus-within:border-violet-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-violet-500/20 transition-all">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" aria-hidden="true" className="shrink-0">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar por club, cancha, distrito o calle..."
              aria-label="Buscar canchas"
              className="min-w-0 flex-1 bg-transparent py-2.5 sm:py-3 px-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
            />
            {buscar && (
              <button
                type="button"
                onClick={() => setBuscar("")}
                aria-label="Limpiar búsqueda"
                className="rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-800"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Distrito */}
          <div className="lg:col-span-3 relative">
            <select
              value={distrito}
              onChange={(e) => setDistrito(e.target.value)}
              aria-label="Distrito"
              className="w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50/70 py-2.5 sm:py-3 px-3.5 pr-8 text-xs sm:text-sm font-medium text-slate-800 outline-none focus:border-violet-500 focus:bg-white focus:ring-2 focus:ring-violet-500/20 transition-all"
            >
              <option value="">Todos los distritos</option>
              {distritos.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">▼</span>
          </div>

          {/* Ordenar */}
          <div className="lg:col-span-3 relative">
            <select
              value={orden}
              onChange={(e) => setOrden(e.target.value as typeof orden)}
              aria-label="Ordenar"
              className="w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50/70 py-2.5 sm:py-3 px-3.5 pr-8 text-xs sm:text-sm font-medium text-slate-800 outline-none focus:border-violet-500 focus:bg-white focus:ring-2 focus:ring-violet-500/20 transition-all"
            >
              <option value="recomendado">{punto ? "📍 Más cerca primero" : "✨ Más recientes"}</option>
              <option value="precio">💵 Menor precio por hora</option>
            </select>
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">▼</span>
          </div>
        </div>

        {/* Sección Horario "¿Cuándo juegas?" */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-violet-50/60 p-3 sm:p-4 border border-violet-100">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600 text-white text-xs">
              ⏱
            </span>
            <div>
              <p className="text-xs font-bold text-violet-950 uppercase tracking-wider">¿Cuándo juegas?</p>
              <p className="text-[11px] text-violet-700">Filtra canchas con turnos disponibles</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[
              { valor: hoy, texto: "Hoy" },
              { valor: sumarDias(hoy, 1), texto: "Mañana" },
            ].map((d) => (
              <button
                key={d.valor}
                type="button"
                onClick={() => setDia(d.valor)}
                aria-pressed={dia === d.valor}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                  dia === d.valor
                    ? "bg-violet-600 text-white shadow-sm"
                    : "bg-white text-violet-900 border border-violet-200 hover:bg-violet-100/50"
                }`}
              >
                {d.texto}
              </button>
            ))}

            <div className="relative min-w-[140px]">
              <select
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                aria-label="Hora de juego"
                className="w-full appearance-none rounded-xl border border-violet-200 bg-white py-1.5 px-3 pr-7 text-xs font-bold text-violet-900 outline-none focus:ring-2 focus:ring-violet-500/20"
              >
                <option value="">A cualquier hora</option>
                {HORAS_BUSQUEDA.map((h) => (
                  <option key={h} value={h}>
                    A las {h}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-violet-700">▼</span>
            </div>

            {hora && (
              <button
                type="button"
                onClick={() => setHora("")}
                className="text-[11px] font-bold text-violet-700 underline underline-offset-2 ml-1"
              >
                Limpiar hora
              </button>
            )}
          </div>
        </div>

        {/* Botón de ubicación */}
        <BotonUbicacion estado={estado} onPedir={pedir} />

        {/* Filtros de modalidad / deporte */}
        {filtros.length > 1 && (
          <div
            className="sin-scroll -mx-4 sm:-mx-6 flex gap-2 overflow-x-auto px-4 sm:px-6 pt-1"
            role="group"
            aria-label="Filtrar por deporte o modalidad"
          >
            {filtros.map((f) => {
              const sel = f.clave === filtro.clave;
              return (
                <button
                  key={f.clave}
                  type="button"
                  onClick={() => setActivo(f.clave)}
                  aria-pressed={sel}
                  className={`shrink-0 rounded-full border px-4 py-1.5 text-xs font-bold transition-all ${
                    sel
                      ? "border-violet-600 bg-violet-600 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:border-violet-500 hover:text-violet-700"
                  }`}
                >
                  {f.texto}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Grid Responsive de Canchas: 1 col móvil, 2 cols tablet, 3 cols desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
        {visibles.map(({ c, km }) => (
          <TarjetaCancha key={c.id} cancha={c} km={km} confianza={confianza[c.id]} libre={libres?.[c.id]} />
        ))}
      </div>

      {/* Botón para cargar más canchas */}
      {hayMas && visibles.length > 0 && (
        <div className="flex justify-center pt-4 pb-6">
          <button
            type="button"
            onClick={cargarMas}
            disabled={cargandoMas}
            className="flex items-center gap-2 rounded-2xl border-2 border-violet-600 bg-white px-7 py-3 text-sm font-extrabold text-violet-700 shadow-sm transition-all hover:bg-violet-600 hover:text-white disabled:opacity-50 active:scale-95"
          >
            {cargandoMas ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Cargando más canchas…
              </>
            ) : (
              "Explorar más canchas en Lima"
            )}
          </button>
        </div>
      )}

      {/* Estado vacío amigable */}
      {visibles.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl bg-white p-8 sm:p-12 text-center sombra-suave border border-slate-100 my-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-violet-50 text-violet-600">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-900">No encontramos canchas con esos filtros</h3>
          <p className="max-w-md text-xs sm:text-sm text-slate-500">
            Intenta buscando en otro distrito o seleccionando otro horario. Hay muchas canchas disponibles en toda la ciudad.
          </p>
          {hayFiltros && (
            <button
              type="button"
              onClick={limpiarFiltros}
              className="mt-2 rounded-xl bg-violet-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-violet-700 transition-colors"
            >
              Restablecer todos los filtros
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function BotonUbicacion({ estado, onPedir }: { estado: ReturnType<typeof useMiUbicacion>["estado"]; onPedir: () => void }) {
  if (estado === "listo") {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-violet-50 px-3.5 py-2 text-xs font-semibold text-violet-800 border border-violet-200">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0 text-violet-600">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span className="flex-1 truncate">Ordenadas por cercanía a tu ubicación GPS</span>
        <button type="button" onClick={onPedir} className="font-bold underline underline-offset-2 hover:opacity-80">
          Actualizar
        </button>
      </div>
    );
  }

  const mensaje =
    estado === "denegado"
      ? "Permiso de ubicación bloqueado. Puedes activarlo en los ajustes del navegador."
      : estado === "error"
        ? "No pudimos detectar tu ubicación. Revisa tu GPS."
        : estado === "no-soportado"
          ? "Tu navegador no permite compartir la ubicación."
          : null;

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={onPedir}
        disabled={estado === "buscando" || estado === "no-soportado"}
        className="flex items-center justify-center gap-2 rounded-xl border border-violet-600/60 bg-violet-50/40 py-2.5 text-xs font-bold text-violet-800 transition-all hover:bg-violet-100 disabled:opacity-60 active:scale-[0.99]"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="text-violet-600">
          <path d="M3 11l18-8-8 18-2-8-8-2z" />
        </svg>
        {estado === "buscando" ? "Localizando canchas cercanas…" : "Mostrar canchas más cercanas a mí"}
      </button>
      {mensaje && <p className="text-[11px] text-slate-500">{mensaje}</p>}
    </div>
  );
}
