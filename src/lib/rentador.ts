// Tipos y utilidades del panel del rentador (crear y editar canchas).
import type { SupabaseClient } from "@supabase/supabase-js";
import { POLITICA_POR_DEFECTO, type Politica } from "@/lib/politicas";

export type Pagos = {
  yape: string;
  plin: string;
  titular: string;
  banco: string;
  cuenta: string;
  cci: string;
  qr: string;
};

export const PAGOS_VACIOS: Pagos = { yape: "", plin: "", titular: "", banco: "BCP", cuenta: "", cci: "", qr: "" };

export const BANCOS = ["BCP", "Interbank", "BBVA", "Scotiabank", "BanBif", "Banco de la Nación", "Caja Arequipa", "Caja Huancayo", "Otro"];

/** Mezcla lo guardado en la BD con los valores por defecto. */
export function pagosDe(v: unknown): Pagos {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const r = { ...PAGOS_VACIOS };
  for (const k of Object.keys(r) as (keyof Pagos)[]) if (typeof o[k] === "string") r[k] = o[k] as string;
  return r;
}

/** Solo los campos con valor (para guardar en canchas.pagos). */
export function pagosParaGuardar(p: Pagos) {
  const r: Partial<Pagos> = {};
  for (const [k, v] of Object.entries(p) as [keyof Pagos, string][]) if (v.trim()) r[k] = v.trim();
  if (!r.cuenta && !r.cci) delete r.banco;
  return r;
}

export function validarPagos(p: Pagos): string | null {
  const cel = (x: string) => /^9\d{8}$/.test(x.replace(/\D/g, ""));
  if (p.yape && !cel(p.yape)) return "El número de Yape debe tener 9 dígitos y empezar con 9.";
  if (p.plin && !cel(p.plin)) return "El número de Plin debe tener 9 dígitos y empezar con 9.";
  if (!p.yape && !p.plin && !p.cuenta && !p.cci && !p.qr) return "Agrega al menos un medio de pago (Yape, Plin o cuenta).";
  if ((p.yape || p.plin || p.cuenta || p.cci) && p.titular.trim().length < 3)
    return "Escribe el nombre del titular: así el cliente sabe que paga a la persona correcta.";
  return null;
}

export type DatosCancha = {
  nombre: string;
  descripcion: string;
  deporte: string;
  modalidades: number[];
  superficie: string;
  duracion_turno_min: number;
  direccion: string;
  distrito: string;
  latitud: number | null;
  longitud: number | null;
  servicios: string[];
  fotos: string[];
  pagos: Pagos;
  politica: Politica;
};

export const DATOS_VACIOS: DatosCancha = {
  nombre: "",
  descripcion: "",
  deporte: "futbol",
  modalidades: [],
  superficie: "Grass sintético",
  duracion_turno_min: 60,
  direccion: "",
  distrito: "",
  latitud: null,
  longitud: null,
  servicios: [],
  fotos: [],
  pagos: PAGOS_VACIOS,
  politica: POLITICA_POR_DEFECTO,
};

export const MODALIDADES = [5, 6, 7, 8, 9, 11];
export const DURACIONES = [30, 60, 90, 120];
export const SUPERFICIES = ["Grass sintético", "Grass natural", "Losa de cemento", "Parquet", "Arena"];
export const SERVICIOS = [
  "Iluminación LED",
  "Vestidores",
  "Duchas",
  "Estacionamiento",
  "Pelotas",
  "Pecheras",
  "Cafetería",
  "Tribuna",
  "Baños",
  "Wifi",
];

export const DISTRITOS_LIMA = [
  "Ancón", "Ate", "Barranco", "Breña", "Callao", "Carabayllo", "Chaclacayo", "Chorrillos",
  "Cieneguilla", "Comas", "El Agustino", "Independencia", "Jesús María", "La Molina",
  "La Perla", "La Punta", "La Victoria", "Lima", "Lince", "Los Olivos", "Lurigancho-Chosica",
  "Lurín", "Magdalena del Mar", "Miraflores", "Pachacámac", "Pucusana", "Pueblo Libre",
  "Puente Piedra", "Punta Hermosa", "Punta Negra", "Rímac", "San Bartolo", "San Borja",
  "San Isidro", "San Juan de Lurigancho", "San Juan de Miraflores", "San Luis",
  "San Martín de Porres", "San Miguel", "Santa Anita", "Santa María del Mar", "Santa Rosa",
  "Santiago de Surco", "Surquillo", "Ventanilla", "Villa El Salvador", "Villa María del Triunfo",
  "Bellavista", "Carmen de la Legua", "Mi Perú",
];

// ---------------------------------------------------------------------------
// Horarios: por cada día (0 = domingo … 6 = sábado) una lista de franjas.

export type FranjaEdit = { ini: string; fin: string; precio: string };
export type Horario = Record<number, FranjaEdit[]>;

/** Lunes primero, como se muestra al usuario. */
export const DIAS_ORDEN = [1, 2, 3, 4, 5, 6, 0];
export const NOMBRE_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** "00:00", "00:30" … "24:00". */
export const HORAS = Array.from({ length: 49 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`
);

export function horarioInicial(): Horario {
  const h: Horario = {};
  for (let d = 0; d < 7; d++) h[d] = [{ ini: "08:00", fin: "23:00", precio: "" }];
  return h;
}

type FranjaBD = { dia_semana: number; hora_inicio: string; hora_fin: string; precio_hora: number };

export function horarioDesdeFranjas(franjas: FranjaBD[]): Horario {
  const h: Horario = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const f of [...franjas].sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio))) {
    h[f.dia_semana].push({
      ini: f.hora_inicio.slice(0, 5),
      fin: f.hora_fin.slice(0, 5) === "00:00" ? "24:00" : f.hora_fin.slice(0, 5),
      precio: String(Number(f.precio_hora)),
    });
  }
  return h;
}

export function franjasParaGuardar(h: Horario) {
  return Object.entries(h).flatMap(([dia, lista]) =>
    lista.map((f) => ({
      dia_semana: Number(dia),
      hora_inicio: f.ini,
      hora_fin: f.fin,
      precio_hora: Number(f.precio),
    }))
  );
}

/** Mensaje del primer problema del horario, o null si está bien. */
export function validarHorario(h: Horario): string | null {
  let alguna = false;
  for (const dia of DIAS_ORDEN) {
    const lista = [...(h[dia] ?? [])].sort((a, b) => a.ini.localeCompare(b.ini));
    for (let i = 0; i < lista.length; i++) {
      const f = lista[i];
      alguna = true;
      if (f.fin <= f.ini) return `${NOMBRE_DIA[dia]}: la hora de cierre debe ser después de la de apertura.`;
      const precio = Number(f.precio);
      if (f.precio.trim() === "" || !Number.isFinite(precio) || precio < 0)
        return `${NOMBRE_DIA[dia]}: escribe el precio por hora.`;
      if (i > 0 && lista[i - 1].fin > f.ini) return `${NOMBRE_DIA[dia]}: hay franjas que se pisan.`;
    }
  }
  return alguna ? null : "Abre la cancha al menos un día.";
}

// ---------------------------------------------------------------------------

export function validarDatos(d: DatosCancha): string | null {
  if (d.nombre.trim().length < 3) return "Escribe el nombre de la cancha.";
  if (!d.direccion.trim()) return "Escribe la dirección.";
  if (!d.distrito) return "Elige el distrito.";
  return null;
}

export function slugDe(nombre: string): string {
  return (
    nombre
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "cancha"
  );
}

/** Campos de la tabla canchas a partir del formulario. */
export function filaCancha(d: DatosCancha) {
  return {
    nombre: d.nombre.trim(),
    descripcion: d.descripcion.trim() || null,
    deporte: d.deporte,
    modalidades: d.deporte === "futbol" ? [...d.modalidades].sort((a, b) => a - b) : [],
    superficie: d.superficie || null,
    duracion_turno_min: d.duracion_turno_min,
    direccion: d.direccion.trim(),
    distrito: d.distrito,
    latitud: d.latitud != null ? Number(d.latitud.toFixed(6)) : null,
    longitud: d.longitud != null ? Number(d.longitud.toFixed(6)) : null,
    servicios: d.servicios,
    fotos: d.fotos,
    pagos: pagosParaGuardar(d.pagos),
    politica_cancelacion: d.politica,
  };
}

/** Igual que filaCancha pero sin los medios de pago, que se guardan aparte (con contraseña). */
export function filaSinPagos(d: DatosCancha) {
  const { pagos: _pagos, ...resto } = filaCancha(d);
  void _pagos;
  return resto;
}

export function traducirError(msg: string): string {
  if (/requiere_clave/.test(msg)) return "Confirma con tu contraseña para cambiar los medios de pago.";
  if (/franjas_se_pisan/.test(msg)) return "Hay franjas de horario que se pisan.";
  if (/franja_invalida/.test(msg)) return "Revisa las horas y precios del horario.";
  if (/sin_permiso|row-level security|permission denied/i.test(msg))
    return "No tienes permiso para esto. Para publicar o editar una cancha publicada debes confirmar tu WhatsApp.";
  if (/guardar_franjas|function .* does not exist|schema cache/i.test(msg))
    return "Falta ejecutar la migración 004 en Supabase.";
  if (/column .*pagos|pagos.* does not exist/i.test(msg)) return "Falta ejecutar la migración 006 en Supabase.";
  if (/bucket not found/i.test(msg)) return "Falta ejecutar la migración 004 (bucket de fotos).";
  return "No se pudo guardar. Inténtalo de nuevo.";
}

// ---------------------------------------------------------------------------
// Fotos: se reducen en el navegador (máx. 1600 px, JPEG) y se suben a Storage.

async function reducir(archivo: File): Promise<Blob> {
  const img = await createImageBitmap(archivo);
  const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, mal) =>
    canvas.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo procesar la imagen"))), "image/jpeg", 0.82)
  );
}

export async function subirFoto(supabase: SupabaseClient, archivo: File): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("sin_permiso");
  const blob = await reducir(archivo);
  const ruta = `${user.id}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from("canchas")
    .upload(ruta, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw error;
  return supabase.storage.from("canchas").getPublicUrl(ruta).data.publicUrl;
}

/** Borra del Storage una foto subida por el rentador (si es de nuestro bucket). */
export async function borrarFoto(supabase: SupabaseClient, url: string) {
  const marca = "/storage/v1/object/public/canchas/";
  const i = url.indexOf(marca);
  if (i === -1) return;
  await supabase.storage.from("canchas").remove([decodeURIComponent(url.slice(i + marca.length))]);
}
