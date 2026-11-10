import Link from "next/link";
import Logo from "@/components/Logo";
import MenuUsuario from "@/components/MenuUsuario";

/** Cabecera verde + contenido para las páginas del panel del rentador. */
export default function MarcoPanel({
  subtitulo,
  titulo,
  volver,
  accion,
  children,
}: {
  subtitulo?: string;
  titulo: string;
  volver?: { href: string; texto: string };
  accion?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="fondo-cancha text-white">
        <div className="mx-auto flex max-w-xl flex-col gap-6 px-5 pb-14 pt-5">
          <nav className="flex items-center justify-between">
            <Logo claro />
            <MenuUsuario claro />
          </nav>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              {volver && (
                <Link href={volver.href} className="mb-1 inline-block text-sm text-white/80 hover:text-white">
                  ← {volver.texto}
                </Link>
              )}
              {subtitulo && <p className="text-sm text-white/80">{subtitulo}</p>}
              <h1 className="truncate text-2xl font-extrabold">{titulo}</h1>
            </div>
            {accion}
          </div>
        </div>
      </header>
      <main className="mx-auto -mt-8 flex max-w-xl flex-col gap-4 px-5 pb-28">{children}</main>
    </div>
  );
}
