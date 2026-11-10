"use client";

import { useMemo, useState } from "react";
import TarjetaCancha, { DEPORTES, type Cancha } from "@/components/TarjetaCancha";
import { distanciaKm, puntoDe, useMiUbicacion } from "@/lib/ubicacion";

type Filtro = { clave: string; texto: string; cumple: (c: Cancha) => boolean };

/** Lista de canchas con filtro por modalidad de fútbol (7, 9, 11…) y otros deportes. */
export default function ListaCanchas({ canchas }: { canchas: Cancha[] }) {
  const [activo, setActivo] = useState("todas");
  const [buscar, setBuscar] = useState("");
  const [distrito, setDistrito] = useState("");
  const [orden, setOrden] = useState<"recomendado" | "precio">("recomendado");
  const { punto, estado, pedir } = useMiUbicacion();

  const distritos = useMemo(() => [...new Set(canchas.map((c) => c.distrito))].sort((a, b) => a.localeCompare(b, "es")), [canchas]);
  const precioDesde = (c: Cancha) => {
    const p = (c.franjas ?? []).map((f) => Number(f.precio_hora));
    return p.length ? Math.min(...p) : Infinity;
  };
  // Sin tildes ni mayúsculas: "chosica" encuentra "Chosica", "futbol" encuentra "Fútbol"
  const plano = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  // Solo se ofrecen filtros que tengan al menos una cancha
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
  // Con ubicación: cada cancha lleva su distancia y se ordenan de la más cercana a la más lejana
  const visibles = useMemo(() => {
    const q = plano(buscar.trim());
    const lista = canchas
      .filter(filtro.cumple)
      .filter((c) => !distrito || c.distrito === distrito)
      .filter((c) => !q || plano(`${c.nombre} ${c.distrito} ${c.direccion}`).includes(q))
      .map((c) => {
        const p = puntoDe(c);
        return { c, km: punto && p ? distanciaKm(punto, p) : null };
      });
    if (orden === "precio") lista.sort((a, b) => precioDesde(a.c) - precioDesde(b.c));
    else if (punto) lista.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canchas, filtro, punto, buscar, distrito, orden]);
  const hayFiltros = !!buscar.trim() || !!distrito || activo !== "todas";

  return (
    <>
      <div className="sombra-fuerte flex flex-col gap-3 rounded-3xl bg-white p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-bold text-[#1B1B1B]">Canchas disponibles</h2>
          <span className="text-sm text-[#5A5A5A]">
            {visibles.length} {visibles.length === 1 ? "cancha" : "canchas"}
          </span>
        </div>

        {/* Buscador */}
        <label className="flex items-center gap-2 rounded-xl border border-[#E3E3E3] px-3 focus-within:border-[#6D28D9]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8A968F" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Busca por nombre, distrito o dirección"
            aria-label="Buscar canchas"
            className="min-w-0 flex-1 bg-transparent py-2.5 text-base outline-none"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <select
            value={distrito}
            onChange={(e) => setDistrito(e.target.value)}
            aria-label="Distrito"
            className="rounded-xl border border-[#E3E3E3] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#6D28D9]"
          >
            <option value="">Todos los distritos</option>
            {distritos.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <select
            value={orden}
            onChange={(e) => setOrden(e.target.value as typeof orden)}
            aria-label="Ordenar"
            className="rounded-xl border border-[#E3E3E3] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#6D28D9]"
          >
            <option value="recomendado">{punto ? "Más cerca" : "Más nuevas"}</option>
            <option value="precio">Menor precio</option>
          </select>
        </div>

        <BotonUbicacion estado={estado} onPedir={pedir} />

        {filtros.length > 1 && (
          <div
            className="sin-scroll -mx-4 flex gap-2 overflow-x-auto px-4"
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
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    sel
                      ? "border-[#0A3D2E] bg-[#0A3D2E] font-bold text-white"
                      : "border-[#E3E3E3] bg-white text-[#1B1B1B] hover:border-[#6D28D9]"
                  }`}
                >
                  {f.texto}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {visibles.map(({ c, km }) => (
        <TarjetaCancha key={c.id} cancha={c} km={km} />
      ))}

      {canchas.length > 0 && visibles.length === 0 && (
        <div className="flex flex-col items-start gap-2 rounded-xl bg-white p-4 text-sm text-[#5A5A5A]">
          <p>No encontramos canchas con esa búsqueda.</p>
          {hayFiltros && (
            <button
              type="button"
              onClick={() => {
                setBuscar("");
                setDistrito("");
                setActivo("todas");
              }}
              className="font-bold text-[#6D28D9]"
            >
              Quitar filtros
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
      <p className="flex items-center gap-2 rounded-xl bg-[#EDE9FE] px-3 py-2 text-sm text-[#6D28D9]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span className="flex-1">Ordenadas de la más cercana a la más lejana</span>
        <button type="button" onClick={onPedir} className="font-bold underline-offset-2 hover:underline">
          Actualizar
        </button>
      </p>
    );
  }

  const mensaje =
    estado === "denegado"
      ? "Bloqueaste la ubicación. Actívala en el candado de la barra de direcciones y vuelve a intentar."
      : estado === "error"
        ? "No pudimos obtener tu ubicación. Inténtalo de nuevo."
        : estado === "no-soportado"
          ? "Tu navegador no permite compartir la ubicación."
          : null;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onPedir}
        disabled={estado === "buscando" || estado === "no-soportado"}
        className="flex items-center justify-center gap-2 rounded-xl border-2 border-[#6D28D9] py-2.5 text-sm font-bold text-[#6D28D9] transition-colors hover:bg-[#EDE9FE] disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M3 11l18-8-8 18-2-8-8-2z" />
        </svg>
        {estado === "buscando" ? "Buscando tu ubicación…" : "Ver canchas cerca de mí"}
      </button>
      {mensaje && <p className="text-xs text-[#5A5A5A]">{mensaje}</p>}
    </div>
  );
}
