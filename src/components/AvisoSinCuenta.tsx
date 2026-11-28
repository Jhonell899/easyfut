import Link from "next/link";

/** "No tienes cuenta. ¿Quieres crear una?": las cuentas solo se crean en Registrarse. */
export default function AvisoSinCuenta({ sufijo = "" }: { sufijo?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900" role="alert">
      <p>
        <strong className="block">No tienes cuenta.</strong>
        ¿Quieres crear una?
      </p>
      <Link href={`/registro${sufijo}`} className="shrink-0 rounded-xl bg-[#6D28D9] px-4 py-2 font-bold text-white">
        Crear cuenta
      </Link>
    </div>
  );
}
