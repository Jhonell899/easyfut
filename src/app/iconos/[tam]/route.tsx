import { ImageResponse } from "next/og";

// Ícono de la app generado al vuelo (192, 512 o 180 para iPhone).
// Fondo verde a sangre para que también sirva como ícono "maskable".
export async function GET(_req: Request, { params }: { params: Promise<{ tam: string }> }) {
  const { tam } = await params;
  const n = tam === "512" ? 512 : tam === "180" ? 180 : 192;
  const balon = Math.round(n * 0.58);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(160deg, #0b6e4f 0%, #13936a 100%)",
        }}
      >
        <svg width={balon} height={balon} viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="15" fill="#FFFFFF" />
          <path d="M16 9.5l5.2 3.8-2 6.1h-6.4l-2-6.1z" fill="#0B6E4F" />
          <path
            d="M16 9.5V4.8M21.2 13.3l4.6-1.5M19.2 19.4l2.8 3.9M12.8 19.4L10 23.3M10.8 13.3l-4.6-1.5"
            stroke="#0B6E4F"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    { width: n, height: n, headers: { "Cache-Control": "public, max-age=604800, immutable" } }
  );
}
