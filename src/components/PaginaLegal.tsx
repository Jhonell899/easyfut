import Link from "next/link";
import Logo from "@/components/Logo";

export type Seccion = { titulo: string; parrafos: string[] };

/** Marco común para Términos y Privacidad. */
export default function PaginaLegal({
  titulo,
  actualizado,
  intro,
  secciones,
  otro,
}: {
  titulo: string;
  actualizado: string;
  intro: string;
  secciones: Seccion[];
  otro: { href: string; texto: string };
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-5 p-5 pb-12">
      <Logo />
      <div>
        <h1 className="text-2xl font-bold">{titulo}</h1>
        <p className="text-xs text-[#8A968F]">Última actualización: {actualizado}</p>
      </div>
      <p className="text-sm text-[#4A4A4A]">{intro}</p>

      {secciones.map((s, i) => (
        <section key={s.titulo} className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="font-bold">
            {i + 1}. {s.titulo}
          </h2>
          {s.parrafos.map((p) => (
            <p key={p} className="text-sm leading-6 text-[#4A4A4A]">
              {p}
            </p>
          ))}
        </section>
      ))}

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-[#0B6E4F]">
        <Link href={otro.href}>{otro.texto}</Link>
        <Link href="/">Volver al inicio</Link>
      </div>
    </main>
  );
}
