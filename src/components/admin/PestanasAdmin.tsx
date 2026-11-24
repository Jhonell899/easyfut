"use client";

import { useState } from "react";
import AdminRentadores from "@/components/admin/AdminRentadores";
import AdminClientes from "@/components/admin/AdminClientes";
import AdminCanchas from "@/components/admin/AdminCanchas";
import AdminCambiosPagos from "@/components/admin/AdminCambiosPagos";
import AdminResenas from "@/components/admin/AdminResenas";
import AdminAccesos from "@/components/admin/AdminAccesos";

const PESTANAS = [
  { clave: "canchas", texto: "Canchas" },
  { clave: "rentadores", texto: "Rentadores" },
  { clave: "clientes", texto: "Clientes" },
  { clave: "pagos", texto: "Cambios de pago" },
  { clave: "resenas", texto: "Reseñas" },
  { clave: "accesos", texto: "Accesos" },
] as const;

export default function PestanasAdmin() {
  const [pestana, setPestana] = useState<(typeof PESTANAS)[number]["clave"]>("canchas");
  return (
    <>
      <div className="sin-scroll -mx-5 flex gap-2 overflow-x-auto px-5" role="tablist">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            type="button"
            role="tab"
            aria-selected={pestana === p.clave}
            onClick={() => setPestana(p.clave)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${
              pestana === p.clave ? "bg-[#0A3D2E] text-white" : "bg-white text-[#1B1B1B] shadow-sm"
            }`}
          >
            {p.texto}
          </button>
        ))}
      </div>
      {pestana === "canchas" ? (
        <AdminCanchas />
      ) : pestana === "rentadores" ? (
        <AdminRentadores />
      ) : pestana === "clientes" ? (
        <AdminClientes />
      ) : pestana === "pagos" ? (
        <AdminCambiosPagos />
      ) : pestana === "resenas" ? (
        <AdminResenas />
      ) : (
        <AdminAccesos />
      )}
    </>
  );
}
