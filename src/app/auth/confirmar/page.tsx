import MarcoAuth from "@/components/MarcoAuth";
import ProcesarEnlace from "@/components/ProcesarEnlace";

export const metadata = { title: "Confirmando" };

// Aquí vuelve el enlace del correo (crear cuenta o entrar desde un dispositivo nuevo)
export default function Confirmar() {
  return (
    <MarcoAuth titulo="Un momento" subtitulo="Estamos confirmando tu enlace.">
      <ProcesarEnlace />
    </MarcoAuth>
  );
}
