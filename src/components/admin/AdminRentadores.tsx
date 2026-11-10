"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import { fmtFecha } from "@/lib/horario";

type Rentador = {
  id: string;
  nombre: string | null;
  correo: string;
  celular: string | null;
  telefono_verificado: string | null;
  referencia: string;
  canchas: number;
  creado: string;
};

function traducir(msg: string) {
  if (/celular_invalido/.test(msg)) return "El número debe tener 9 dígitos y empezar con 9.";
  if (/celular_en_uso/.test(msg)) return "Ese número ya está verificado en otra cuenta.";
  if (/sin_permiso/.test(msg)) return "Tu cuenta no es administradora.";
  if (/admin_|does not exist|schema cache/i.test(msg)) return "Falta ejecutar la migración 008 en Supabase.";
  return "No se pudo completar. Inténtalo de nuevo.";
}

/** Lista de rentadores: verificar su celular a mano tras recibir su WhatsApp. */
export default function AdminRentadores() {
  const [lista, setLista] = useState<Rentador[] | null>(null);
  const [buscar, setBuscar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [editando, setEditando] = useState<Record<string, string>>({});

  const cargar = useCallback(async () => {
    const supabase = supabaseNavegador();
    if (!supabase) return;
    const { data, error } = await supabase.rpc("admin_rentadores");
    if (error) setError(traducir(error.message));
    setLista((data ?? []) as Rentador[]);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function verificar(r: Rentador) {
    const numero = (editando[r.id] ?? r.celular ?? "").replace(/\D/g, "");
    const supabase = supabaseNavegador();
    if (!supabase) return;
    setOcupado(r.id);
    setError(null);
    const { error } = await supabase.rpc("admin_verificar_telefono", { p_id: r.id, p_celular: numero });
    setOcupado(null);
    if (error) return setError(traducir(error.message));
    cargar();
  }

  async function quitar(r: Rentador) {
    if (!confirm(`¿Quitar el WhatsApp confirmado de ${r.nombre ?? r.correo}? No podrá publicar canchas nuevas.`)) return;
    const supabase = supabaseNavegador();
    if (!supabase) return;
    setOcupado(r.id);
    const { error } = await supabase.rpc("admin_quitar_verificacion", { p_id: r.id });
    setOcupado(null);
    if (error) return setError(traducir(error.message));
    cargar();
  }

  const q = buscar.trim().toLowerCase();
  const visibles = (lista ?? []).filter(
    (r) =>
      !q ||
      r.referencia.toLowerCase().includes(q) ||
      (r.nombre ?? "").toLowerCase().includes(q) ||
      r.correo.toLowerCase().includes(q) ||
      (r.celular ?? "").includes(q)
  );
  const porVerificar = (lista ?? []).filter((r) => !r.telefono_verificado).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-2xl bg-white p-3 shadow-sm">
          <p className={`text-2xl font-extrabold ${porVerificar ? "text-amber-600" : ""}`}>{lista ? porVerificar : "–"}</p>
          <p className="text-xs text-[#5A5A5A]">Sin WhatsApp</p>
        </div>
        <div className="rounded-2xl bg-white p-3 shadow-sm">
          <p className="text-2xl font-extrabold">{lista ? lista.length : "–"}</p>
          <p className="text-xs text-[#5A5A5A]">Rentadores</p>
        </div>
      </div>

      <input
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
        placeholder="Buscar por referencia, nombre, correo o celular"
        className="rounded-xl border border-[#E3E3E3] bg-white px-3 py-3 text-base outline-none focus:border-[#0B6E4F]"
      />

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {lista === null ? (
        <div className="h-32 animate-pulse rounded-2xl bg-white" />
      ) : visibles.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-sm text-[#5A5A5A]">No hay rentadores{q ? " con esa búsqueda" : ""}.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibles.map((r) => {
            const numero = editando[r.id] ?? r.celular ?? "";
            return (
              <li key={r.id} className="flex flex-col gap-3 rounded-2xl bg-white p-4 text-sm shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{r.nombre ?? "Sin nombre"}</p>
                    <p className="truncate text-[#5A5A5A]">{r.correo}</p>
                    <p className="text-xs text-[#8A968F]">
                      {r.canchas} cancha{r.canchas === 1 ? "" : "s"} · desde{" "}
                      {fmtFecha(r.creado, { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="rounded-lg bg-[#1B1B1B] px-2 py-0.5 font-mono text-xs font-bold tracking-wider text-white">
                      {r.referencia}
                    </span>
                    {r.telefono_verificado ? (
                      <span className="rounded-full bg-[#E6EEEA] px-2 py-0.5 text-[11px] font-bold text-[#0B6E4F]">✓ WhatsApp</span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">Sin confirmar</span>
                    )}
                  </div>
                </div>

                {r.telefono_verificado ? (
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      +51 <strong>{r.telefono_verificado}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => quitar(r)}
                      disabled={ocupado === r.id}
                      className="text-xs font-bold text-red-700 disabled:opacity-50"
                    >
                      Quitar confirmación
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <div className="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-xl border border-[#E3E3E3]">
                        <span className="flex items-center bg-[#F2F5F3] px-2 text-[#5A5A5A]">+51</span>
                        <input
                          inputMode="numeric"
                          value={numero}
                          onChange={(e) => setEditando({ ...editando, [r.id]: e.target.value })}
                          className="min-w-0 flex-1 px-2 py-2 outline-none"
                          aria-label="Celular a verificar"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => verificar(r)}
                        disabled={ocupado === r.id || !/^9\d{8}$/.test(numero.replace(/\D/g, ""))}
                        className="shrink-0 rounded-xl bg-[#0B6E4F] px-3 font-bold text-white disabled:opacity-50"
                      >
                        Confirmar WhatsApp
                      </button>
                    </div>
                    {/^9\d{8}$/.test(numero.replace(/\D/g, "")) && (
                      <a
                        href={`https://wa.me/51${numero.replace(/\D/g, "")}?text=${encodeURIComponent(
                          `Hola ${r.nombre ?? ""}, te escribimos de EasyFut para confirmar tu número y aprobar tu cuenta de rentador.`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="self-start text-xs font-bold text-[#128C4A] underline-offset-2 hover:underline"
                      >
                        Escribirle por WhatsApp
                      </a>
                    )}
                    <p className="text-xs text-[#5A5A5A]">
                      Es el número que el rentador comprobó en la app. Apruébalo si es correcto; puedes escribirle antes desde aquí (referencia{" "}
                      <strong>{r.referencia}</strong>).
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
