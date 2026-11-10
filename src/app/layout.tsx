import type { Metadata, Viewport } from "next";
import BarraInferior from "@/components/BarraInferior";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "EasyFut · Reserva tu cancha", template: "%s · EasyFut" },
  description: "EasyFut: encuentra y reserva canchas de fútbol cerca de ti en minutos.",
  applicationName: "EasyFut",
  // Al instalarla en iPhone se abre a pantalla completa con su ícono
  appleWebApp: { capable: true, title: "EasyFut", statusBarStyle: "default" },
  icons: { apple: "/iconos/180" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#062A1F",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="antialiased">
        {children}
        <BarraInferior />
      </body>
    </html>
  );
}
