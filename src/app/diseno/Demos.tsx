"use client";

import { useState } from "react";
import { Boton, Campo } from "@/components/ui";
import { useCopiar } from "@/hooks/useCopiar";
import { PromoActiva, ResumenSaldo } from "@/components/panel/saldo/ResumenSaldo";
import { FormularioRecarga } from "@/components/panel/saldo/FormularioRecarga";
import { ListaMovimientos } from "@/components/panel/saldo/Historial";
import type { Saldo } from "@/components/panel/saldo/tipos";

const SALDO_EJEMPLO: Saldo = {
  saldo: 4,
  precio_reserva: 1,
  reservas_disponibles: 4,
  yape_numero: "987654321",
  yape_titular: "EasyFut Ejemplo",
  bcp_cuenta: "19100000000012",
  bcp_cci: "00219100000000001200",
  bcp_titular: "EasyFut Ejemplo",
  bono_porcentaje: 10,
  bono_desde: 50,
  bono_hasta: null,
  reservas_mes: 12,
  gastado_mes: 12,
  auto_hasta: 20,
  recarga_auto_bloqueada: false,
  mi_nombre: "Dueño de ejemplo",
  mi_celular: "912345678",
};

/** La pantalla de saldo del dueño con datos de ejemplo (no envía nada). */
export function DemoSaldo() {
  return (
    <div className="flex flex-col gap-4">
      <ResumenSaldo saldo={SALDO_EJEMPLO} />
      <PromoActiva saldo={SALDO_EJEMPLO} />
      <FormularioRecarga saldo={SALDO_EJEMPLO} alAvisar={() => {}} />
      <ListaMovimientos
        movimientos={[
          { id: "1", tipo: "reserva", monto: -1, detalle: "Reserva 3F9A1C0B", created_at: "2026-11-25T23:00:00Z" },
          { id: "2", tipo: "recarga", monto: 20, detalle: "Recarga Yape 12345678", created_at: "2026-11-24T15:00:00Z" },
          { id: "3", tipo: "regalo", monto: 5, detalle: "Regalo de bienvenida", created_at: "2026-11-20T10:00:00Z" },
        ]}
      />
    </div>
  );
}

/** Ejemplos con estado, para la guía de diseño. */
export function DemoBotonCargando() {
  const [cargando, setCargando] = useState(false);
  return (
    <Boton
      cargando={cargando}
      onClick={() => {
        setCargando(true);
        setTimeout(() => setCargando(false), 1500);
      }}
    >
      {cargando ? "Guardando…" : "Tócame"}
    </Boton>
  );
}

export function DemoCopiar() {
  const { copiado, copiar } = useCopiar();
  return (
    <div className="flex items-center gap-3 rounded-xl bg-marca-tinte p-3">
      <span className="flex-1 font-extrabold tracking-wide text-marca-texto">987 654 321</span>
      <Boton variante="secundario" tamano="sm" onClick={() => copiar("987654321", "yape")}>
        {copiado === "yape" ? "¡Copiado!" : "Copiar"}
      </Boton>
    </div>
  );
}

export function DemoCampos() {
  const [celular, setCelular] = useState("");
  const valido = /^9\d{8}$/.test(celular);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Campo etiqueta="Nombre y apellido" placeholder="Ej. Juan Pérez" autoComplete="name" />
      <Campo
        etiqueta="Celular"
        inputMode="numeric"
        placeholder="987 654 321"
        value={celular}
        onChange={(e) => setCelular(e.target.value.replace(/\D/g, "").slice(0, 9))}
        ayuda="Debe tener WhatsApp"
        error={celular && !valido ? "Debe tener 9 dígitos y empezar con 9." : undefined}
      />
    </div>
  );
}
