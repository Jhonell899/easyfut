type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  etiqueta: string;
  ayuda?: string;
  conError?: boolean;
};

export default function CampoTexto({ etiqueta, ayuda, conError, className, ...input }: Props) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-[#1B1B1B]">
      {etiqueta}
      <input
        {...input}
        className={`w-full rounded-xl border px-3 py-3 text-base font-normal outline-none focus:border-[#0B6E4F] ${
          conError ? "border-red-400" : "border-[#E3E3E3]"
        } ${className ?? ""}`}
      />
      {ayuda && (
        <span className={`text-xs font-normal ${conError ? "text-red-700" : "text-[#5A5A5A]"}`}>
          {ayuda}
        </span>
      )}
    </label>
  );
}
