"use client";

import { useCallback, useEffect, useState } from "react";

export type Punto = { lat: number; lng: number };
export type EstadoUbicacion = "inactivo" | "buscando" | "listo" | "denegado" | "error" | "no-soportado";

const CLAVE = "easyfut:ubicacion";
const VIGENCIA_MS = 30 * 60 * 1000; // la última ubicación sirve 30 min

function leerGuardada(): Punto | null {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return null;
    const { lat, lng, t } = JSON.parse(raw);
    if (typeof lat !== "number" || typeof lng !== "number" || Date.now() - t > VIGENCIA_MS) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

function guardar(p: Punto) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ ...p, t: Date.now() }));
  } catch {}
}

/**
 * Ubicación del usuario. Solo pregunta al navegador cuando se llama a `pedir()`,
 * salvo que el permiso ya esté concedido: entonces se obtiene sola.
 */
export function useMiUbicacion() {
  const [punto, setPunto] = useState<Punto | null>(null);
  const [estado, setEstado] = useState<EstadoUbicacion>("inactivo");

  const pedir = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setEstado("no-soportado");
      return;
    }
    setEstado("buscando");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        guardar(p);
        setPunto(p);
        setEstado("listo");
      },
      (err) => setEstado(err.code === err.PERMISSION_DENIED ? "denegado" : "error"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  }, []);

  useEffect(() => {
    const guardada = leerGuardada();
    if (guardada) {
      setPunto(guardada);
      setEstado("listo");
    }
    // Si el usuario ya dio permiso antes, se actualiza sin preguntar
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((p) => {
        if (p.state === "granted") pedir();
      })
      .catch(() => {});
  }, [pedir]);

  return { punto, estado, pedir };
}

/** Distancia en km entre dos puntos (fórmula de Haversine). */
export function distanciaKm(a: Punto, b: Punto): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Punto de una cancha, o null si no tiene coordenadas. */
export function puntoDe(c: { latitud?: number | string | null; longitud?: number | string | null }): Punto | null {
  if (c.latitud == null || c.longitud == null) return null;
  const lat = Number(c.latitud);
  const lng = Number(c.longitud);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/** "650 m" o "3,2 km". */
export function fmtDistancia(km: number): string {
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  return `${km < 10 ? km.toFixed(1).replace(".", ",") : Math.round(km)} km`;
}

export type Cercania = { texto: string; clase: string };

/** Qué tan cerca está, con colores para la etiqueta. */
export function cercania(km: number): Cercania {
  if (km < 2) return { texto: "Muy cerca", clase: "bg-[#0B6E4F] text-white" };
  if (km < 5) return { texto: "Cerca de ti", clase: "bg-[#E6EEEA] text-[#0B6E4F]" };
  if (km < 12) return { texto: "Algo lejos", clase: "bg-amber-50 text-amber-800" };
  return { texto: "Lejos", clase: "bg-[#F1F1F1] text-[#5A5A5A]" };
}
