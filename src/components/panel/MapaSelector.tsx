"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as MapaLeaflet, Marker } from "leaflet";

const LIMA = { lat: -12.0464, lng: -77.0428 };

/**
 * Mapa para marcar la ubicación exacta de la cancha.
 * Toca el mapa o arrastra el pin; `onCambio` recibe las coordenadas.
 */
export default function MapaSelector({
  lat,
  lng,
  onCambio,
}: {
  lat: number | null;
  lng: number | null;
  onCambio: (lat: number, lng: number) => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaLeaflet | null>(null);
  const pin = useRef<Marker | null>(null);
  const alCambiar = useRef(onCambio);
  alCambiar.current = onCambio;

  // Crea el mapa una sola vez (Leaflet solo funciona en el navegador)
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelado || !caja.current || mapa.current) return;

      const icono = L.divIcon({
        className: "",
        html: `<svg width="36" height="44" viewBox="0 0 24 30" style="filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))"><path d="M12 0C5.4 0 0 5.2 0 11.7 0 20.4 12 30 12 30s12-9.6 12-18.3C24 5.2 18.6 0 12 0z" fill="#6D28D9"/><circle cx="12" cy="11.5" r="4.5" fill="#fff"/></svg>`,
        iconSize: [36, 44],
        iconAnchor: [18, 44],
      });

      const centro = lat != null && lng != null ? { lat, lng } : LIMA;
      const m = L.map(caja.current, { zoomControl: true, attributionControl: true }).setView(
        centro,
        lat != null ? 17 : 12
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(m);

      const ponerPin = (p: { lat: number; lng: number }) => {
        if (!pin.current) {
          pin.current = L.marker(p, { icon: icono, draggable: true }).addTo(m);
          pin.current.on("dragend", () => {
            const q = pin.current!.getLatLng();
            alCambiar.current(q.lat, q.lng);
          });
        } else {
          pin.current.setLatLng(p);
        }
      };

      if (lat != null && lng != null) ponerPin({ lat, lng });
      m.on("click", (e) => {
        ponerPin(e.latlng);
        alCambiar.current(e.latlng.lat, e.latlng.lng);
      });
      mapa.current = m;
      (m as unknown as { _ponerPin: typeof ponerPin })._ponerPin = ponerPin;
    })();
    return () => {
      cancelado = true;
      mapa.current?.remove();
      mapa.current = null;
      pin.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si las coordenadas cambian desde fuera (búsqueda, "mi ubicación"), mueve el pin
  useEffect(() => {
    const m = mapa.current as (MapaLeaflet & { _ponerPin?: (p: { lat: number; lng: number }) => void }) | null;
    if (!m || lat == null || lng == null) return;
    const actual = pin.current?.getLatLng();
    if (actual && Math.abs(actual.lat - lat) < 1e-7 && Math.abs(actual.lng - lng) < 1e-7) return;
    m._ponerPin?.({ lat, lng });
    m.setView({ lat, lng }, Math.max(m.getZoom(), 17));
  }, [lat, lng]);

  return <div ref={caja} className="relative z-0 h-64 w-full rounded-xl" aria-label="Mapa para marcar la ubicación" />;
}
