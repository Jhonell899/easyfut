import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EasyFut · Reserva tu cancha",
  description: "EasyFut: encuentra y reserva canchas de fútbol cerca de ti en minutos.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
