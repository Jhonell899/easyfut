"use client";

import { useState } from "react";
import AdminRentadores from "@/components/admin/AdminRentadores";
import AdminClientes from "@/components/admin/AdminClientes";

const PESTANAS = [
  { clave: "rentadores", texto: "Rentadores" },
  { clave: "clientes", texto: "Clientes" },
] as const;

export default function PestanasAdmin() {
  const [pestana, setPestana] = useState<(typeof PESTANAS)[number]["clave"]>("rentadores");
  return (
    <>
      <div className="flex gap-2" role="tablist">
        {PESTANAS.map((p) => (
          <button
            key={p.clave}
            type="button"
            role="tab"
            aria-selected={pestana === p.clave}
            onClick={() => setPestana(p.clave)}
            className={`rounded-full px-4 py-2 text-sm font-bold ${
              pestana === p.clave ? "bg-[#1B1B1B] text-white" : "bg-white text-[#1B1B1B] shadow-sm"
            }`}
          >
            {p.texto}
          </button>
        ))}
      </div>
      {pestana === "rentadores" ? <AdminRentadores /> : <AdminClientes />}
    </>
  );
}
