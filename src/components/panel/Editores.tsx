"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import CampoTexto from "@/components/CampoTexto";
import { DEPORTES } from "@/components/TarjetaCancha";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { fmtDuracion } from "@/lib/horario";
import {
  BANCOS,
  DIAS_ORDEN,
  DISTRITOS_LIMA,
  DURACIONES,
  HORAS,
  MODALIDADES,
  NOMBRE_DIA,
  SERVICIOS,
  SUPERFICIES,
  borrarFoto,
  subirFoto,
  traducirError,
  type DatosCancha,
  type FranjaEdit,
  type Horario,
  type Pagos,
} from "@/lib/rentador";

const MapaSelector = dynamic(() => import("@/components/panel/MapaSelector"), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-xl bg-[#EDE9FE]" />,
});

type EditorProps = {
  datos: DatosCancha;
  cambiar: (parcial: Partial<DatosCancha>) => void;
};

// ---------------------------------------------------------------------------
// Piezas comunes

export function Tarjeta({ titulo, detalle, children }: { titulo: string; detalle?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-sm">
      <div>
        <h2 className="font-bold text-[#1B1B1B]">{titulo}</h2>
        {detalle && <p className="text-sm text-[#5A5A5A]">{detalle}</p>}
      </div>
      {children}
    </section>
  );
}

function Opcion({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
        activo
          ? "border-[#6D28D9] bg-[#6D28D9] font-bold text-white"
          : "border-[#E3E3E3] bg-white text-[#1B1B1B] hover:border-[#6D28D9]"
      }`}
    >
      {children}
    </button>
  );
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-medium text-[#1B1B1B]">{children}</span>;
}

const claseSelect =
  "w-full rounded-xl border border-[#E3E3E3] bg-white px-3 py-3 text-base outline-none focus:border-[#6D28D9]";

// ---------------------------------------------------------------------------
// 1. Datos básicos

export function EditorDatos({ datos, cambiar }: EditorProps) {
  const alternar = (n: number) =>
    cambiar({
      modalidades: datos.modalidades.includes(n)
        ? datos.modalidades.filter((m) => m !== n)
        : [...datos.modalidades, n],
    });

  return (
    <div className="flex flex-col gap-4">
      <CampoTexto
        etiqueta="Nombre de la cancha"
        placeholder="Ej. Complejo Deportivo El Golazo"
        value={datos.nombre}
        maxLength={80}
        onChange={(e) => cambiar({ nombre: e.target.value })}
        required
      />

      <div className="flex flex-col gap-2">
        <Etiqueta>Deporte</Etiqueta>
        <div className="flex flex-wrap gap-2">
          {Object.entries(DEPORTES).map(([clave, texto]) => (
            <Opcion key={clave} activo={datos.deporte === clave} onClick={() => cambiar({ deporte: clave })}>
              {texto}
            </Opcion>
          ))}
        </div>
      </div>

      {datos.deporte === "futbol" && (
        <div className="flex flex-col gap-2">
          <Etiqueta>¿Qué fútbol se puede jugar?</Etiqueta>
          <div className="flex flex-wrap gap-2">
            {MODALIDADES.map((n) => (
              <Opcion key={n} activo={datos.modalidades.includes(n)} onClick={() => alternar(n)}>
                Fútbol {n}
              </Opcion>
            ))}
          </div>
          <span className="text-xs text-[#5A5A5A]">
            Marca todas las que apliquen. Por ejemplo, una cancha de 11 que se divide en dos de 7.
          </span>
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <Etiqueta>Superficie</Etiqueta>
        <select className={claseSelect} value={datos.superficie} onChange={(e) => cambiar({ superficie: e.target.value })}>
          {SUPERFICIES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-2">
        <Etiqueta>Duración de cada turno</Etiqueta>
        <div className="flex flex-wrap gap-2">
          {DURACIONES.map((d) => (
            <Opcion key={d} activo={datos.duracion_turno_min === d} onClick={() => cambiar({ duracion_turno_min: d })}>
              {fmtDuracion(d)}
            </Opcion>
          ))}
        </div>
        <span className="text-xs text-[#5A5A5A]">Los clientes reservan en bloques de este tamaño.</span>
      </div>

      <label className="flex flex-col gap-1.5">
        <Etiqueta>Descripción (opcional)</Etiqueta>
        <textarea
          rows={3}
          maxLength={500}
          placeholder="Cuéntales a los jugadores qué hace especial tu cancha."
          value={datos.descripcion}
          onChange={(e) => cambiar({ descripcion: e.target.value })}
          className="w-full rounded-xl border border-[#E3E3E3] px-3 py-3 text-base outline-none focus:border-[#6D28D9]"
        />
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Ubicación

export function EditorUbicacion({ datos, cambiar }: EditorProps) {
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function buscarDireccion() {
    if (!datos.direccion.trim()) return setAviso("Primero escribe la dirección.");
    setBuscando(true);
    setAviso(null);
    try {
      const q = `${datos.direccion}, ${datos.distrito || "Lima"}, Perú`;
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pe&q=${encodeURIComponent(q)}`,
        { headers: { "Accept-Language": "es" } }
      );
      const [lugar] = (await r.json()) as { lat: string; lon: string }[];
      if (!lugar) setAviso("No encontramos esa dirección. Marca el punto tocando el mapa.");
      else cambiar({ latitud: Number(lugar.lat), longitud: Number(lugar.lon) });
    } catch {
      setAviso("No se pudo buscar ahora. Marca el punto tocando el mapa.");
    }
    setBuscando(false);
  }

  function usarMiUbicacion() {
    if (!navigator.geolocation) return setAviso("Tu navegador no permite compartir la ubicación.");
    setBuscando(true);
    setAviso(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        cambiar({ latitud: p.coords.latitude, longitud: p.coords.longitude });
        setBuscando(false);
      },
      () => {
        setAviso("No pudimos obtener tu ubicación. Marca el punto tocando el mapa.");
        setBuscando(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <CampoTexto
        etiqueta="Dirección"
        placeholder="Ej. Av. Universitaria 1234"
        value={datos.direccion}
        maxLength={120}
        onChange={(e) => cambiar({ direccion: e.target.value })}
        required
      />
      <label className="flex flex-col gap-1.5">
        <Etiqueta>Distrito</Etiqueta>
        <select className={claseSelect} value={datos.distrito} onChange={(e) => cambiar({ distrito: e.target.value })}>
          <option value="">Elige el distrito</option>
          {[...DISTRITOS_LIMA].sort((a, b) => a.localeCompare(b, "es")).map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-2">
        <Etiqueta>Ubicación en el mapa</Etiqueta>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={buscarDireccion}
            disabled={buscando}
            className="rounded-xl border border-[#6D28D9] px-3 py-2 text-sm font-bold text-[#6D28D9] disabled:opacity-50"
          >
            Buscar dirección
          </button>
          <button
            type="button"
            onClick={usarMiUbicacion}
            disabled={buscando}
            className="rounded-xl border border-[#6D28D9] px-3 py-2 text-sm font-bold text-[#6D28D9] disabled:opacity-50"
          >
            Estoy en la cancha
          </button>
        </div>
        <MapaSelector
          lat={datos.latitud}
          lng={datos.longitud}
          onCambio={(latitud, longitud) => cambiar({ latitud, longitud })}
        />
        <span className={`text-xs ${aviso ? "text-amber-800" : "text-[#5A5A5A]"}`}>
          {aviso ??
            (datos.latitud != null
              ? "Listo. Si no está exacto, arrastra el pin hasta la entrada de la cancha."
              : "Toca el mapa donde está la entrada. Así los jugadores sabrán qué tan cerca están.")}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Horarios y precios

export function EditorHorarios({ horario, setHorario }: { horario: Horario; setHorario: (h: Horario) => void }) {
  const cambiarDia = (dia: number, lista: FranjaEdit[]) => setHorario({ ...horario, [dia]: lista });

  function copiarATodos(origen: number, dias: number[]) {
    const copia: Horario = { ...horario };
    for (const d of dias) copia[d] = horario[origen].map((f) => ({ ...f }));
    setHorario(copia);
  }

  return (
    <div className="flex flex-col gap-3">
      {DIAS_ORDEN.map((dia) => {
        const lista = horario[dia] ?? [];
        const abierto = lista.length > 0;
        return (
          <div key={dia} className="rounded-xl border border-[#E3E3E3] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold">{NOMBRE_DIA[dia]}</span>
              <label className="flex items-center gap-2 text-sm">
                <span className={abierto ? "text-[#6D28D9]" : "text-[#8A968F]"}>{abierto ? "Abierto" : "Cerrado"}</span>
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[#6D28D9]"
                  checked={abierto}
                  onChange={(e) =>
                    cambiarDia(dia, e.target.checked ? [{ ini: "08:00", fin: "23:00", precio: lista[0]?.precio ?? "" }] : [])
                  }
                />
              </label>
            </div>

            {abierto && (
              <div className="mt-3 flex flex-col gap-2">
                {lista.map((f, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
                    <label className="flex flex-col gap-1 text-xs text-[#5A5A5A]">
                      Desde
                      <select
                        className="rounded-lg border border-[#E3E3E3] bg-white px-2 py-2 text-sm text-[#1B1B1B]"
                        value={f.ini}
                        onChange={(e) => cambiarDia(dia, lista.map((x, j) => (j === i ? { ...x, ini: e.target.value } : x)))}
                      >
                        {HORAS.slice(0, -1).map((h) => (
                          <option key={h}>{h}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-[#5A5A5A]">
                      Hasta
                      <select
                        className="rounded-lg border border-[#E3E3E3] bg-white px-2 py-2 text-sm text-[#1B1B1B]"
                        value={f.fin}
                        onChange={(e) => cambiarDia(dia, lista.map((x, j) => (j === i ? { ...x, fin: e.target.value } : x)))}
                      >
                        {HORAS.slice(1).map((h) => (
                          <option key={h} value={h}>
                            {h === "24:00" ? "24:00 (medianoche)" : h}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-[#5A5A5A]">
                      S/ por hora
                      <input
                        inputMode="decimal"
                        placeholder="60"
                        className="w-full rounded-lg border border-[#E3E3E3] px-2 py-2 text-sm text-[#1B1B1B]"
                        value={f.precio}
                        onChange={(e) =>
                          cambiarDia(
                            dia,
                            lista.map((x, j) => (j === i ? { ...x, precio: e.target.value.replace(/[^\d.]/g, "") } : x))
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => cambiarDia(dia, lista.filter((_, j) => j !== i))}
                      className="mb-1 rounded-lg p-1.5 text-[#8A968F] hover:bg-red-50 hover:text-red-600"
                      aria-label="Quitar franja"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <button
                    type="button"
                    className="font-bold text-[#6D28D9]"
                    onClick={() => {
                      const ultima = lista.at(-1)!;
                      cambiarDia(dia, [...lista, { ini: ultima.fin === "24:00" ? "18:00" : ultima.fin, fin: "24:00", precio: "" }]);
                    }}
                  >
                    + Otro precio (ej. noche)
                  </button>
                  <button type="button" className="text-[#5A5A5A] underline-offset-2 hover:underline" onClick={() => copiarATodos(dia, DIAS_ORDEN)}>
                    Copiar a todos los días
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Servicios

export function EditorServicios({ datos, cambiar }: EditorProps) {
  const [otro, setOtro] = useState("");
  const todos = [...new Set([...SERVICIOS, ...datos.servicios])];
  const alternar = (s: string) =>
    cambiar({
      servicios: datos.servicios.includes(s) ? datos.servicios.filter((x) => x !== s) : [...datos.servicios, s],
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {todos.map((s) => (
          <Opcion key={s} activo={datos.servicios.includes(s)} onClick={() => alternar(s)}>
            {s}
          </Opcion>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const s = otro.trim();
          if (s && !datos.servicios.includes(s)) cambiar({ servicios: [...datos.servicios, s] });
          setOtro("");
        }}
      >
        <input
          value={otro}
          maxLength={40}
          onChange={(e) => setOtro(e.target.value)}
          placeholder="Otro servicio…"
          className="min-w-0 flex-1 rounded-xl border border-[#E3E3E3] px-3 py-2 text-sm outline-none focus:border-[#6D28D9]"
        />
        <button type="submit" className="rounded-xl bg-[#EDE9FE] px-4 text-sm font-bold text-[#6D28D9]">
          Agregar
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Fotos

const MAX_FOTOS = 6;

export function EditorFotos({ datos, cambiar }: EditorProps) {
  const [subiendo, setSubiendo] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // Copia actualizada para no perder fotos si se suben varias a la vez
  const fotos = useRef(datos.fotos);
  fotos.current = datos.fotos;

  async function elegir(archivos: FileList | null) {
    const supabase = supabaseNavegador();
    if (!archivos || !supabase) return;
    setError(null);
    const lista = [...archivos].slice(0, MAX_FOTOS - datos.fotos.length);
    setSubiendo(lista.length);
    for (const a of lista) {
      try {
        const url = await subirFoto(supabase, a);
        cambiar({ fotos: [...fotos.current, url] });
        fotos.current = [...fotos.current, url];
      } catch (e) {
        setError(traducirError(e instanceof Error ? e.message : ""));
      }
      setSubiendo((n) => n - 1);
    }
    if (input.current) input.current.value = "";
  }

  function quitar(url: string) {
    cambiar({ fotos: datos.fotos.filter((f) => f !== url) });
    const supabase = supabaseNavegador();
    if (supabase) borrarFoto(supabase, url);
  }

  function portada(url: string) {
    cambiar({ fotos: [url, ...datos.fotos.filter((f) => f !== url)] });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {datos.fotos.map((url, i) => (
          <div key={url} className="group relative aspect-square overflow-hidden rounded-xl bg-[#EDE9FE]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
            {i === 0 ? (
              <span className="absolute left-1.5 top-1.5 rounded-full bg-[#6D28D9] px-2 py-0.5 text-[10px] font-bold text-white">
                Portada
              </span>
            ) : (
              <button
                type="button"
                onClick={() => portada(url)}
                className="absolute left-1.5 top-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-[#6D28D9]"
              >
                Usar de portada
              </button>
            )}
            <button
              type="button"
              onClick={() => quitar(url)}
              aria-label="Quitar foto"
              className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        ))}
        {Array.from({ length: subiendo }).map((_, i) => (
          <div key={`s${i}`} className="flex aspect-square animate-pulse items-center justify-center rounded-xl bg-[#EDE9FE] text-xs text-[#6D28D9]">
            Subiendo…
          </div>
        ))}
        {datos.fotos.length + subiendo < MAX_FOTOS && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[#C9BFEA] text-sm font-bold text-[#6D28D9] hover:bg-[#EDE9FE]"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Agregar foto
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => elegir(e.target.files)}
      />
      <span className="text-xs text-[#5A5A5A]">
        Hasta {MAX_FOTOS} fotos. La primera es la portada. Fotos de día y con buena luz atraen más reservas.
      </span>
      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. Medios de pago (el cliente paga directo al dueño)

export function EditorPagos({ datos, cambiar }: EditorProps) {
  const p = datos.pagos;
  const poner = (parcial: Partial<Pagos>) => cambiar({ pagos: { ...p, ...parcial } });
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function subirQr(archivo?: File) {
    const supabase = supabaseNavegador();
    if (!archivo || !supabase) return;
    setSubiendo(true);
    setError(null);
    try {
      const url = await subirFoto(supabase, archivo);
      if (p.qr) borrarFoto(supabase, p.qr);
      poner({ qr: url });
    } catch (e) {
      setError(traducirError(e instanceof Error ? e.message : ""));
    }
    setSubiendo(false);
    if (input.current) input.current.value = "";
  }

  const soloNumeros = (v: string, max: number) => v.replace(/[^\d-]/g, "").slice(0, max);

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-xl bg-[#EDE9FE] p-3 text-sm text-[#6D28D9]">
        El cliente tiene <strong>10 minutos</strong> para pagarte y avisarte por WhatsApp; si no, el horario se
        libera. Cuando avise que pagó, confírmalo desde tu panel lo antes posible.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <CampoTexto
          etiqueta="Yape"
          inputMode="numeric"
          placeholder="987 654 321"
          value={p.yape}
          onChange={(e) => poner({ yape: soloNumeros(e.target.value, 9) })}
        />
        <CampoTexto
          etiqueta="Plin"
          inputMode="numeric"
          placeholder="987 654 321"
          value={p.plin}
          onChange={(e) => poner({ plin: soloNumeros(e.target.value, 9) })}
        />
      </div>

      <CampoTexto
        etiqueta="Titular (como aparece en Yape / Plin / banco)"
        placeholder="Ej. Juan Pérez G."
        maxLength={60}
        value={p.titular}
        onChange={(e) => poner({ titular: e.target.value })}
      />

      <div className="flex flex-col gap-2">
        <Etiqueta>Código QR (opcional)</Etiqueta>
        <div className="flex items-center gap-3">
          {p.qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.qr} alt="QR de pago" className="h-24 w-24 rounded-xl border border-[#E3E3E3] object-contain" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-xl border-2 border-dashed border-[#C9BFEA] text-xs text-[#8A968F]">
              Sin QR
            </div>
          )}
          <div className="flex flex-col items-start gap-1">
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={subiendo}
              className="rounded-xl border border-[#6D28D9] px-3 py-2 text-sm font-bold text-[#6D28D9] disabled:opacity-50"
            >
              {subiendo ? "Subiendo…" : p.qr ? "Cambiar QR" : "Subir QR"}
            </button>
            {p.qr && (
              <button type="button" onClick={() => poner({ qr: "" })} className="text-xs text-red-700">
                Quitar
              </button>
            )}
            <span className="text-xs text-[#5A5A5A]">Captura de tu QR de Yape o Plin.</span>
          </div>
        </div>
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => subirQr(e.target.files?.[0])} />
      </div>

      <details className="rounded-xl border border-[#E3E3E3] p-3" open={!!(p.cuenta || p.cci)}>
        <summary className="cursor-pointer text-sm font-bold">Transferencia bancaria (opcional)</summary>
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <Etiqueta>Banco</Etiqueta>
            <select className={claseSelect} value={p.banco} onChange={(e) => poner({ banco: e.target.value })}>
              {BANCOS.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <CampoTexto
            etiqueta="Número de cuenta"
            inputMode="numeric"
            value={p.cuenta}
            onChange={(e) => poner({ cuenta: soloNumeros(e.target.value, 30) })}
          />
          <CampoTexto
            etiqueta="CCI (otros bancos)"
            inputMode="numeric"
            value={p.cci}
            onChange={(e) => poner({ cci: soloNumeros(e.target.value, 30) })}
          />
        </div>
      </details>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
