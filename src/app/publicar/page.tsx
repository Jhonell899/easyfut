import Link from "next/link";
import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/sesionServidor";
import Logo from "@/components/Logo";
import MenuUsuario from "@/components/MenuUsuario";
import HacermeRentador from "@/components/panel/HacermeRentador";

export const metadata = { title: "Publica tu cancha" };
export const dynamic = "force-dynamic";

const VENTAJAS = [
  { titulo: "Reservas las 24 horas", detalle: "Los jugadores ven tus horarios libres y reservan solos, sin llamarte." },
  { titulo: "Cero cruces de horario", detalle: "El sistema no permite dos reservas en el mismo horario." },
  { titulo: "Todo en tu celular", detalle: "Confirma pagos, bloquea horas y registra reservas presenciales." },
  { titulo: "Te encuentran cerca", detalle: "Los jugadores ven qué tan cerca está tu cancha de ellos." },
];

const PASOS = ["Crea tu cuenta de rentador", "Llena los datos, horarios y precios", "Publica y empieza a recibir reservas"];

export default async function Publicar() {
  const sesion = await usuarioActual();
  if (sesion?.perfil?.rol === "dueno") redirect("/panel/nueva");

  return (
    <div className="min-h-screen">
      <header className="fondo-cancha text-white">
        <div className="mx-auto flex max-w-xl flex-col gap-8 px-5 pb-16 pt-5">
          <nav className="flex items-center justify-between">
            <Logo claro />
            <MenuUsuario claro />
          </nav>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-bold uppercase tracking-wide text-[#C4B5FD]">Para dueños de canchas</p>
            <h1 className="text-3xl font-extrabold leading-tight">
              Llena tu cancha
              <br />
              sin estar pegado al teléfono
            </h1>
            <p className="text-white/80">Publica tu cancha en EasyFut en menos de 10 minutos.</p>
          </div>
        </div>
      </header>

      <main className="mx-auto -mt-8 flex max-w-xl flex-col gap-4 px-5 pb-12">
        <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm">
          {sesion ? (
            <>
              <div>
                <h2 className="font-bold">Tu cuenta es de comprador</h2>
                <p className="text-sm text-[#5A5A5A]">
                  Conviértela en cuenta de rentador para publicar canchas. Podrás seguir reservando como siempre.
                </p>
              </div>
              <HacermeRentador />
            </>
          ) : (
            <>
              <Link
                href={`/registro?tipo=dueno&next=${encodeURIComponent("/panel/nueva")}`}
                className="rounded-xl bg-[#6D28D9] py-3 text-center font-bold text-white"
              >
                Crear cuenta de rentador
              </Link>
              <p className="text-center text-sm text-[#5A5A5A]">
                ¿Ya tienes cuenta?{" "}
                <Link href={`/ingresar?next=${encodeURIComponent("/publicar")}`} className="font-bold text-[#6D28D9]">
                  Ingresar
                </Link>
              </p>
            </>
          )}
        </section>

        <section className="grid grid-cols-2 gap-2">
          {VENTAJAS.map((v) => (
            <div key={v.titulo} className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="font-bold text-[#6D28D9]">{v.titulo}</p>
              <p className="mt-1 text-sm text-[#5A5A5A]">{v.detalle}</p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-bold">Así de fácil</h2>
          <ol className="flex flex-col gap-3">
            {PASOS.map((p, i) => (
              <li key={p} className="flex items-center gap-3 text-sm">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] font-bold text-[#6D28D9]">
                  {i + 1}
                </span>
                {p}
              </li>
            ))}
          </ol>
        </section>

        <Link href="/" className="text-center text-sm text-[#5A5A5A] underline-offset-2 hover:underline">
          ← Volver a buscar canchas
        </Link>
      </main>
    </div>
  );
}
