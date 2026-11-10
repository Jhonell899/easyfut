import type { MetadataRoute } from "next";

// Hace que EasyFut se pueda "instalar" en el celular como una app (PWA).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EasyFut · Reserva tu cancha",
    short_name: "EasyFut",
    description: "Encuentra y reserva canchas de fútbol cerca de ti en minutos.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "es-PE",
    background_color: "#062A1F",
    theme_color: "#062A1F",
    categories: ["sports", "lifestyle"],
    icons: [
      { src: "/iconos/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/iconos/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/iconos/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Mis reservas", url: "/reservas" },
      { name: "Mi panel", url: "/panel" },
    ],
  };
}
