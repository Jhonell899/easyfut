import Link from "next/link";

/** Marca EasyFut deportiva. `claro` para usar sobre fondos oscuros. */
export default function Logo({ claro = false }: { claro?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5 transition-transform hover:scale-[1.02]" aria-label="EasyFut, inicio">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0 drop-shadow-sm">
        <circle cx="16" cy="16" r="15" fill={claro ? "#FFFFFF" : "#6D28D9"} />
        <path
          d="M16 9.5l5.2 3.8-2 6.1h-6.4l-2-6.1z"
          fill={claro ? "#6D28D9" : "#FFFFFF"}
        />
        <path
          d="M16 9.5V4.8M21.2 13.3l4.6-1.5M19.2 19.4l2.8 3.9M12.8 19.4L10 23.3M10.8 13.3l-4.6-1.5"
          stroke={claro ? "#6D28D9" : "#FFFFFF"}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      <span className={`text-xl font-extrabold tracking-tight ${claro ? "text-white" : "text-[#0F172A]"}`}>
        Easy<span className={claro ? "text-[#C4B5FD]" : "text-[#6D28D9]"}>Fut</span>
      </span>
    </Link>
  );
}
