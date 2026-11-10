import Logo from "@/components/Logo";

/** Marco común de Ingresar / Crear cuenta: portada verde + tarjeta blanca. */
export default function MarcoAuth({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="fondo-cancha text-white">
        <div className="mx-auto flex max-w-md flex-col gap-6 px-5 pb-16 pt-5">
          <Logo claro />
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-extrabold">{titulo}</h1>
            <p className="text-white/80">{subtitulo}</p>
          </div>
        </div>
      </header>
      <main className="mx-auto -mt-10 max-w-md px-5 pb-10">
        <div className="rounded-3xl bg-white p-5 shadow-sm">{children}</div>
      </main>
    </div>
  );
}
