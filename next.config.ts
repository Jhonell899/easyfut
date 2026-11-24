import type { NextConfig } from "next";
import path from "path";

// Cabeceras de seguridad para todas las páginas
const seguridad = [
  // Nadie puede mostrar EasyFut dentro de un marco (evita engaños tipo "clickjacking")
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  // El navegador no "adivina" el tipo de archivo
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Al salir hacia otro sitio solo se comparte el dominio, no la dirección completa
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Solo EasyFut puede pedir la ubicación; cámara y micrófono desactivados
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=()" },
  // Siempre https (los navegadores lo ignoran en http://localhost)
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname),
  // Oculta el botón flotante "N" de Next.js en desarrollo
  devIndicators: false,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: seguridad }];
  },
};

export default nextConfig;
