// Códigos de reserva recordados en este navegador (comodidad para el cliente,
// que no inicia sesión). Si el almacenamiento falla, simplemente no se recuerdan.
const CLAVE = "mis-reservas";

export function leerCodigos(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? "[]");
    return Array.isArray(v) ? v.filter((c) => typeof c === "string") : [];
  } catch {
    return [];
  }
}

export function guardarCodigo(codigo: string) {
  try {
    const lista = [codigo, ...leerCodigos().filter((c) => c !== codigo)].slice(0, 20);
    localStorage.setItem(CLAVE, JSON.stringify(lista));
  } catch {
    /* sin almacenamiento disponible */
  }
}
