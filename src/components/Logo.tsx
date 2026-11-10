import Link from "next/link";

/** Marca EasyFut. `claro` para usar sobre fondos verdes/oscuros. */
export default function Logo({ claro = false }: { claro?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="EasyFut, inicio">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="15" fill={claro ? "#FFFFFF" : "#0B6E4F"} />
        <path
          d="M16 9.5l5.2 3.8-2 6.1h-6.4l-2-6.1z"
          fill={claro ? "#0B6E4F" : "#FFFFFF"}
        />
        <path
          d="M16 9.5V4.8M21.2 13.3l4.6-1.5M19.2 19.4l2.8 3.9M12.8 19.4L10 23.3M10.8 13.3l-4.6-1.5"
          stroke={claro ? "#0B6E4F" : "#FFFFFF"}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      <span className={`text-xl font-extrabold tracking-tight ${claro ? "text-white" : "text-[#1B1B1B]"}`}>
        Easy<span className={claro ? "text-[#B6F09C]" : "text-[#0B6E4F]"}>Fut</span>
      </span>
    </Link>
  );
}
