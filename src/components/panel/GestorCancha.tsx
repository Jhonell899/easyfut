"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import {
  filaCancha,
  franjasParaGuardar,
  horarioDesdeFranjas,
  traducirError,
  validarDatos,
  validarHorario,
  validarPagos,
  type DatosCancha,
  type Horario,
} from "@/lib/rentador";
import { refrescarPublico } from "@/app/panel/acciones";
import { EditorDatos, EditorFotos, EditorHorarios, EditorPagos, EditorServicios, EditorUbicacion, Tarjeta } from "@/components/panel/Editores";
import ReservasDia from "@/components/panel/ReservasDia";

export type CanchaBD = DatosCancha & { id: string; slug: string; activa: boolean };
type FranjaBD = { dia_semana: number; hora_inicio: string; hora_fin: string; precio_hora: number };

const PESTANAS = [
  { clave: "reservas", texto: "Reservas" },
  { clave: "horarios", texto: "Horarios" },
  { clave: "pagos", texto: "Pagos" },
  { clave: "datos", texto: "Datos" },
  { clave: "ubicacion", texto: "Ubicación" },
  { clave: "fotos", texto: "Fotos y servicios" },
] as const;
type Pestana = (typeof PESTANAS)[number]["clave"];

export default function GestorCancha({
  cancha,
  franjas,
  nueva,
  verificado,
}: {
  cancha: CanchaBD;
  franjas: FranjaBD[];
  nueva?: boolean;
  verificado: boolean;
}) {
  const router = useRouter();
  const [pestana, setPestana] = useState<Pestana>(nueva ? "reservas" : "reservas");
  const [activa, setActiva] = useState(cancha.activa);
  const [datos, setDatos] = useState<DatosCancha>(cancha);
  const [horario, setHorario] = useState<Horario>(() => horarioDesdeFranjas(franjas));
  const [guardados, setGuardados] = useState(() => ({
    datos: JSON.stringify(filaCancha(cancha)),
    horario: JSON.stringify(franjasParaGuardar(horarioDesdeFranjas(franjas))),
  }));
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(
    nueva ? { tipo: "ok", texto: "¡Tu cancha ya está publicada! Los jugadores ya pueden reservarla." } : null
  );

  const cambiar = (p: Partial<DatosCancha>) => setDatos((d) => ({ ...d, ...p }));
  const datosCambiaron = JSON.stringify(filaCancha(datos)) !== guardados.datos;
  const horarioCambio = JSON.stringify(franjasParaGuardar(horario)) !== guardados.horario;
  const hayCambios = datosCambiaron || horarioCambio;

  const franjasActuales = useMemo(() => franjasParaGuardar(horario), [horario]);

  async function guardar() {
    const supabase = supabaseNavegador();
    if (!supabase) return;
    const problema =
      (datosCambiaron && (validarDatos(datos) || validarPagos(datos.pagos))) || (horarioCambio && validarHorario(horario));
    if (problema) return setMensaje({ tipo: "error", texto: problema });

    setGuardando(true);
    setMensaje(null);
    if (datosCambiaron) {
      const { error } = await supabase.from("canchas").update(filaCancha(datos)).eq("id", cancha.id);
      if (error) {
        setGuardando(false);
        return setMensaje({ tipo: "error", texto: traducirError(error.message) });
      }
    }
    if (horarioCambio) {
      const { error } = await supabase.rpc("guardar_franjas", {
        p_cancha_id: cancha.id,
        p_franjas: franjasParaGuardar(horario),
      });
      if (error) {
        setGuardando(false);
        return setMensaje({ tipo: "error", texto: traducirError(error.message) });
      }
    }
    setGuardados({
      datos: JSON.stringify(filaCancha(datos)),
      horario: JSON.stringify(franjasParaGuardar(horario)),
    });
    await refrescarPublico(cancha.slug);
    setGuardando(false);
    setMensaje({ tipo: "ok", texto: "Cambios guardados." });
    router.refresh();
  }

  async function alternarPublicada() {
    const supabase = supabaseNavegador();
    if (!supabase) return;
    const nuevo = !activa;
    if (nuevo && !verificado)
      return setMensaje({ tipo: "error", texto: "Confirma tu WhatsApp (arriba) para publicar tu cancha." });
    setActiva(nuevo);
    const { error } = await supabase.from("canchas").update({ activa: nuevo }).eq("id", cancha.id);
    if (error) {
      setActiva(!nuevo);
      return setMensaje({ tipo: "error", texto: traducirError(error.message) });
    }
    await refrescarPublico(cancha.slug);
    setMensaje({
      tipo: "ok",
      texto: nuevo ? "Tu cancha está visible y se puede reservar." : "Pausada: ya no aparece ni se puede reservar.",
    });
  }

  return (
    <>
      {/* Estado de la publicación */}
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-bold">
            <span className={`h-2.5 w-2.5 rounded-full ${activa ? "bg-[#18A058]" : "bg-[#B0B0B0]"}`} />
            {activa ? "Publicada" : "Pausada"}
          </p>
          <p className="text-xs text-[#5A5A5A]">
            {activa ? "Visible para los jugadores." : "Oculta: nadie puede verla ni reservar."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {activa && (
            <Link href={`/c/${cancha.slug}`} target="_blank" className="rounded-xl px-3 py-2 text-sm font-bold text-[#0B6E4F] hover:bg-[#E6EEEA]">
              Ver
            </Link>
          )}
          <button
            type="button"
            onClick={alternarPublicada}
            className={`rounded-xl px-3 py-2 text-sm font-bold ${
              activa ? "border border-[#E3E3E3] text-[#1B1B1B]" : "bg-[#0B6E4F] text-white"
            }`}
          >
            {activa ? "Pausar" : "Publicar"}
          </button>
        </div>
      </div>

      {mensaje && (
        <p
          className={`rounded-xl p-3 text-sm ${mensaje.tipo === "ok" ? "bg-[#E6EEEA] text-[#0B6E4F]" : "bg-red-50 text-red-700"}`}
          role={mensaje.tipo === "ok" ? "status" : "alert"}
        >
          {mensaje.texto}
        </p>
      )}

      {/* Pestañas */}
      <div className="sin-scroll -mx-5 flex gap-2 overflow-x-auto px-5" role="tablist">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            type="button"
            role="tab"
            aria-selected={pestana === p.clave}
            onClick={() => setPestana(p.clave)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
              pestana === p.clave ? "bg-[#1B1B1B] text-white" : "bg-white text-[#1B1B1B] shadow-sm"
            }`}
          >
            {p.texto}
          </button>
        ))}
      </div>

      {pestana === "reservas" && (
        <ReservasDia canchaId={cancha.id} canchaNombre={datos.nombre} duracionTurno={datos.duracion_turno_min} franjas={franjasActuales} />
      )}
      {pestana === "horarios" && (
        <Tarjeta titulo="Horarios y precios" detalle="Los cambios no afectan las reservas ya hechas.">
          <EditorHorarios horario={horario} setHorario={setHorario} />
        </Tarjeta>
      )}
      {pestana === "pagos" && (
        <Tarjeta titulo="Medios de pago" detalle="Se muestran al cliente después de reservar.">
          <EditorPagos datos={datos} cambiar={cambiar} />
        </Tarjeta>
      )}
      {pestana === "datos" && (
        <Tarjeta titulo="Datos de la cancha">
          <EditorDatos datos={datos} cambiar={cambiar} />
        </Tarjeta>
      )}
      {pestana === "ubicacion" && (
        <Tarjeta titulo="Ubicación">
          <EditorUbicacion datos={datos} cambiar={cambiar} />
        </Tarjeta>
      )}
      {pestana === "fotos" && (
        <>
          <Tarjeta titulo="Fotos">
            <EditorFotos datos={datos} cambiar={cambiar} />
          </Tarjeta>
          <Tarjeta titulo="Servicios">
            <EditorServicios datos={datos} cambiar={cambiar} />
          </Tarjeta>
        </>
      )}

      {hayCambios && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[#E3E3E3] bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center gap-3 px-5 py-3">
            <p className="flex-1 text-sm text-[#5A5A5A]">Tienes cambios sin guardar</p>
            <button
              type="button"
              onClick={() => {
                setDatos(cancha);
                setHorario(horarioDesdeFranjas(franjas));
                setMensaje(null);
              }}
              className="rounded-xl px-3 py-3 text-sm font-bold text-[#5A5A5A]"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className="rounded-xl bg-[#0B6E4F] px-5 py-3 font-bold text-white disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
