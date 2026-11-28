"use client";

import { BotonVerClave, useVerClave } from "@/components/ui/VerClave";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  etiqueta: string;
  ayuda?: string;
  conError?: boolean;
};

export default function CampoTexto({ etiqueta, ayuda, conError, className, ...input }: Props) {
  // Las contraseñas llevan un ojo para verlas
  const esClave = input.type === "password";
  const ver = useVerClave();
  const campo = (
    <input
      {...input}
      type={esClave ? ver.tipo : input.type}
      className={`w-full rounded-xl border px-3 py-3 text-base font-normal outline-none focus:border-[#6D28D9] ${
        conError ? "border-red-400" : "border-[#E3E3E3]"
      } ${esClave ? "pr-12" : ""} ${className ?? ""}`}
    />
  );
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-[#1B1B1B]">
      {etiqueta}
      {esClave ? (
        <div className="relative">
          {campo}
          <BotonVerClave {...ver} />
        </div>
      ) : (
        campo
      )}
      {ayuda && (
        <span className={`text-xs font-normal ${conError ? "text-red-700" : "text-[#5A5A5A]"}`}>
          {ayuda}
        </span>
      )}
    </label>
  );
}
