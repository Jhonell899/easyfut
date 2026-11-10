"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { etiquetaDeporte } from "@/components/TarjetaCancha";
import { fmtDuracion } from "@/lib/horario";
import {
  DATOS_VACIOS,
  DIAS_ORDEN,
  NOMBRE_DIA,
  filaCancha,
  franjasParaGuardar,
  horarioInicial,
  slugDe,
  traducirError,
  validarDatos,
  validarHorario,
  validarPagos,
  pagosDe,
  type DatosCancha,
  type Horario,
} from "@/lib/rentador";
import { refrescarPublico } from "@/app/panel/acciones";
import { EditorDatos, EditorFotos, EditorHorarios, EditorPagos, EditorServicios, EditorUbicacion, Tarjeta } from "@/components/panel/Editores";

const BORRADOR = "easyfut:borrador-cancha";

const PASOS = [
  { titulo: "Tu cancha", detalle: "Lo básico para que los jugadores la encuentren." },
  { titulo: "¿Dónde queda?", detalle: "La dirección y el punto exacto en el mapa." },
  { titulo: "Horarios y precios", detalle: "Los días que abres y cuánto cobras por hora." },
  { titulo: "¿Cómo te pagan?", detalle: "Yape, Plin o transferencia: el cliente te paga directo." },
  { titulo: "Servicios y fotos", detalle: "Lo que ofreces y cómo se ve." },
  { titulo: "Revisa y publica", detalle: "Así verán tu cancha los jugadores." },
];

/** Asistente paso a paso para publicar la primera (o una nueva) cancha. */
export default function AsistenteCancha() {
  const router = useRouter();
  const [paso, setPaso] = useState(0);
  const [datos, setDatos] = useState<DatosCancha>(DATOS_VACIOS);
  const [horario, setHorario] = useState<Horario>(horarioInicial);
  const [error, setError] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [creada, setCreada] = useState<{ id: string; slug: string } | null>(null);
  const [cargado, setCargado] = useState(false);

  const cambiar = (p: Partial<DatosCancha>) => setDatos((d) => ({ ...d, ...p }));

  // Borrador: si recarga la página no pierde lo escrito
  useEffect(() => {
    try {
      const b = JSON.parse(localStorage.getItem(BORRADOR) ?? "null");
      if (b?.datos) setDatos({ ...DATOS_VACIOS, ...b.datos, pagos: pagosDe(b.datos.pagos) });
      if (b?.horario) setHorario(b.horario);
      if (typeof b?.paso === "number") setPaso(Math.min(b.paso, PASOS.length - 1));
    } catch {}
    setCargado(true);
  }, []);
  useEffect(() => {
    if (!cargado) return;
    try {
      localStorage.setItem(BORRADOR, JSON.stringify({ datos, horario, paso }));
    } catch {}
  }, [datos, horario, paso, cargado]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [paso]);

  function validarPaso(): string | null {
    if (paso === 0 && datos.nombre.trim().length < 3) return "Escribe el nombre de la cancha.";
    if (paso === 0 && datos.deporte === "futbol" && datos.modalidades.length === 0)
      return "Marca qué fútbol se puede jugar (7, 9, 11…).";
    if (paso === 1) return validarDatos(datos);
    if (paso === 2) return validarHorario(horario);
    if (paso === 3) return validarPagos(datos.pagos);
    return null;
  }

  function siguiente() {
    const e = validarPaso();
    setError(e);
    if (!e) setPaso((p) => p + 1);
  }

  async function publicar() {
    const supabase = supabaseNavegador();
    if (!supabase) return;
    const problema = validarDatos(datos) ?? validarHorario(horario) ?? validarPagos(datos.pagos);
    if (problema) return setError(problema);
    setPublicando(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setPublicando(false);
      return setError("Tu sesión expiró. Vuelve a ingresar.");
    }

    // 1. Crear la cancha (si un intento anterior ya la creó, se reutiliza)
    let cancha = creada;
    if (!cancha) {
      const base = slugDe(datos.nombre);
      for (let intento = 0; intento < 4 && !cancha; intento++) {
        const slug = intento === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
        const { data, error } = await supabase
          .from("canchas")
          .insert({ ...filaCancha(datos), slug, dueno_id: user.id, activa: true })
          .select("id, slug")
          .single();
        if (data) cancha = data;
        else if (error?.code !== "23505") {
          setPublicando(false);
          return setError(traducirError(error?.message ?? ""));
        }
      }
      if (!cancha) {
        setPublicando(false);
        return setError("No se pudo crear la cancha. Inténtalo de nuevo.");
      }
      setCreada(cancha);
    }

    // 2. Horarios y precios
    const { error: errFranjas } = await supabase.rpc("guardar_franjas", {
      p_cancha_id: cancha.id,
      p_franjas: franjasParaGuardar(horario),
    });
    if (errFranjas) {
      setPublicando(false);
      setPaso(2);
      return setError(traducirError(errFranjas.message));
    }

    try {
      localStorage.removeItem(BORRADOR);
    } catch {}
    await refrescarPublico(cancha.slug);
    router.push(`/panel/c/${cancha.id}?nueva=1`);
  }

  const actual = PASOS[paso];
  const ultimo = paso === PASOS.length - 1;

  return (
    <>
      {/* Progreso */}
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-sm">
          <span className="font-bold text-[#0B6E4F]">
            Paso {paso + 1} de {PASOS.length}
          </span>
          <span className="text-[#5A5A5A]">{actual.titulo}</span>
        </div>
        <div className="mt-2 flex gap-1">
          {PASOS.map((_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= paso ? "bg-[#0B6E4F]" : "bg-[#E3E3E3]"}`} />
          ))}
        </div>
      </div>

      <Tarjeta titulo={actual.titulo} detalle={actual.detalle}>
        {paso === 0 && <EditorDatos datos={datos} cambiar={cambiar} />}
        {paso === 1 && <EditorUbicacion datos={datos} cambiar={cambiar} />}
        {paso === 2 && <EditorHorarios horario={horario} setHorario={setHorario} />}
        {paso === 3 && <EditorPagos datos={datos} cambiar={cambiar} />}
        {paso === 4 && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-bold">Servicios</h3>
              <EditorServicios datos={datos} cambiar={cambiar} />
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-bold">Fotos</h3>
              <EditorFotos datos={datos} cambiar={cambiar} />
            </div>
          </div>
        )}
        {paso === 5 && <Resumen datos={datos} horario={horario} irA={setPaso} />}
      </Tarjeta>

      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {/* Barra inferior */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[#E3E3E3] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl gap-3 px-5 py-3">
          {paso > 0 && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setPaso((p) => p - 1);
              }}
              className="rounded-xl border border-[#E3E3E3] px-5 py-3 font-bold text-[#1B1B1B]"
            >
              Atrás
            </button>
          )}
          <button
            type="button"
            onClick={ultimo ? publicar : siguiente}
            disabled={publicando}
            className="flex-1 rounded-xl bg-[#0B6E4F] py-3 font-bold text-white disabled:opacity-50"
          >
            {ultimo ? (publicando ? "Publicando…" : "Publicar cancha") : "Continuar"}
          </button>
        </div>
      </div>
    </>
  );
}

function Resumen({ datos, horario, irA }: { datos: DatosCancha; horario: Horario; irA: (p: number) => void }) {
  const fila = (titulo: string, valor: React.ReactNode, paso: number) => (
    <div className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-xs text-[#5A5A5A]">{titulo}</p>
        <div className="text-sm text-[#1B1B1B]">{valor}</div>
      </div>
      <button type="button" onClick={() => irA(paso)} className="shrink-0 text-sm font-bold text-[#0B6E4F]">
        Editar
      </button>
    </div>
  );

  const abiertos = DIAS_ORDEN.filter((d) => horario[d]?.length);

  return (
    <div className="flex flex-col">
      {datos.fotos[0] ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={datos.fotos[0]} alt="Portada" className="mb-2 h-40 w-full rounded-xl object-cover" />
      ) : (
        <div className="fondo-cancha mb-2 flex h-28 items-center justify-center rounded-xl text-sm text-white/80">
          Sin fotos (puedes agregarlas después)
        </div>
      )}
      <div className="divide-y divide-[#EFEFEF]">
        {fila(
          "Cancha",
          <>
            <strong>{datos.nombre}</strong>
            <span className="block text-[#5A5A5A]">
              {etiquetaDeporte(datos.deporte, datos.modalidades)} · {datos.superficie} · turnos de{" "}
              {fmtDuracion(datos.duracion_turno_min)}
            </span>
          </>,
          0
        )}
        {fila(
          "Ubicación",
          <>
            {datos.direccion}, {datos.distrito}
            <span className={`block text-xs ${datos.latitud != null ? "text-[#0B6E4F]" : "text-amber-700"}`}>
              {datos.latitud != null ? "✓ Marcada en el mapa" : "Sin punto en el mapa: no aparecerá en “cerca de mí”"}
            </span>
          </>,
          1
        )}
        {fila(
          "Horario",
          <ul className="flex flex-col gap-0.5">
            {abiertos.map((d) => (
              <li key={d}>
                <span className="inline-block w-20 text-[#5A5A5A]">{NOMBRE_DIA[d]}</span>
                {horario[d].map((f) => `${f.ini}–${f.fin} S/ ${f.precio}`).join(" · ")}
              </li>
            ))}
          </ul>,
          2
        )}
        {fila(
          "Pagos",
          [
            datos.pagos.yape && `Yape ${datos.pagos.yape}`,
            datos.pagos.plin && `Plin ${datos.pagos.plin}`,
            (datos.pagos.cuenta || datos.pagos.cci) && datos.pagos.banco,
            datos.pagos.qr && "QR",
          ]
            .filter(Boolean)
            .join(" · ") + (datos.pagos.titular ? ` — ${datos.pagos.titular}` : ""),
          3
        )}
        {fila(
          "Servicios y fotos",
          `${datos.servicios.length ? datos.servicios.join(", ") : "Sin servicios"} · ${datos.fotos.length} foto${
            datos.fotos.length === 1 ? "" : "s"
          }`,
          3
        )}
      </div>
    </div>
  );
}
