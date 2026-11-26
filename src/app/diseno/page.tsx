import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Aviso, Boton, CampoTexto, Esqueleto, Insignia, Tarjeta, Vacio } from "@/components/ui";
import { DemoBotonCargando, DemoCampos, DemoCopiar, DemoSaldo } from "./Demos";

export const metadata = { title: "Guía de diseño", robots: { index: false } };

const COLORES = [
  { nombre: "marca", clase: "bg-marca", uso: "Botones y acciones" },
  { nombre: "marca-oscuro", clase: "bg-marca-oscuro", uso: "Botón presionado" },
  { nombre: "marca-texto", clase: "bg-marca-texto", uso: "Texto sobre morado claro" },
  { nombre: "marca-claro", clase: "bg-marca-claro", uso: "Detalles" },
  { nombre: "marca-tinte", clase: "bg-marca-tinte", uso: "Fondos suaves" },
  { nombre: "cancha", clase: "bg-cancha", uso: "Portadas y barras" },
  { nombre: "cancha-noche", clase: "bg-cancha-noche", uso: "Fondo oscuro" },
  { nombre: "exito", clase: "bg-exito", uso: "Pagado, confirmado" },
  { nombre: "exito-tinte", clase: "bg-exito-tinte", uso: "Fondo de éxito" },
  { nombre: "tinta", clase: "bg-tinta", uso: "Texto principal" },
  { nombre: "tinta-suave", clase: "bg-tinta-suave", uso: "Texto secundario" },
  { nombre: "tinta-tenue", clase: "bg-tinta-tenue", uso: "Pistas" },
  { nombre: "borde", clase: "bg-borde", uso: "Bordes" },
  { nombre: "superficie-suave", clase: "bg-superficie-suave", uso: "Cajas grises" },
  { nombre: "fondo", clase: "bg-fondo", uso: "Fondo de la app" },
];

function Seccion({ titulo, codigo, children }: { titulo: string; codigo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-extrabold text-tinta">{titulo}</h2>
        <code className="text-xs text-tinta-suave">{codigo}</code>
      </div>
      {children}
    </section>
  );
}

/** Catálogo del sistema de diseño. No aparece en la versión publicada. */
export default function GuiaDiseno() {
  if (process.env.VERCEL_ENV === "production") notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 p-5 pb-16">
      <header className="flex flex-col gap-2">
        <Insignia tono="marca" className="self-start">
          Solo para el equipo
        </Insignia>
        <h1 className="text-3xl font-extrabold text-tinta">Guía de diseño EasyFut</h1>
        <p className="text-sm text-tinta-suave">
          Componentes de <code>src/components/ui</code> y hooks de <code>src/hooks</code>. Úsalos en vez de copiar
          clases: así toda la app se ve igual y un cambio aquí cambia en todas partes.
        </p>
      </header>

      <Seccion titulo="Colores" codigo="bg-marca · text-tinta-suave · border-borde …">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {COLORES.map((c) => (
            <div key={c.nombre} className="flex items-center gap-3 rounded-xl bg-superficie p-2 shadow-sm">
              <span className={`h-10 w-10 shrink-0 rounded-lg border border-borde ${c.clase}`} />
              <span className="min-w-0 text-xs">
                <span className="block truncate font-bold text-tinta">{c.nombre}</span>
                <span className="block truncate text-tinta-suave">{c.uso}</span>
              </span>
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Botones" codigo={'<Boton variante="secundario" tamano="sm" cargando href="/…">'}>
        <div className="flex flex-wrap items-center gap-2">
          <Boton>Principal</Boton>
          <Boton variante="secundario">Secundario</Boton>
          <Boton variante="suave">Suave</Boton>
          <Boton variante="fantasma">Fantasma</Boton>
          <Boton variante="exito">✓ Me llegó</Boton>
          <Boton variante="peligro">No me llegó</Boton>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Boton tamano="sm">Pequeño</Boton>
          <Boton tamano="md">Mediano</Boton>
          <Boton tamano="lg">Grande</Boton>
          <Boton disabled>Deshabilitado</Boton>
          <DemoBotonCargando />
          <Boton variante="secundario" href="/">
            Como enlace
          </Boton>
        </div>
        <Boton ancho tamano="lg">
          Ancho completo · Reservar
        </Boton>
      </Seccion>

      <Seccion titulo="Tarjetas" codigo={'<Tarjeta titulo="…" descripcion="…" accion={…} tono="aviso">'}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Tarjeta titulo="Saldo para reservas" descripcion="S/ 1 por reserva confirmada" accion={<Boton tamano="sm">Recargar</Boton>}>
            <p className="text-3xl font-extrabold text-tinta">S/ 12.00</p>
          </Tarjeta>
          <Tarjeta tono="marca" titulo="Tono marca">
            Información destacada.
          </Tarjeta>
          <Tarjeta tono="exito" titulo="Tono éxito">
            ¡Pago confirmado!
          </Tarjeta>
          <Tarjeta tono="aviso" titulo="Tono aviso">
            Te quedan pocas reservas.
          </Tarjeta>
          <Tarjeta tono="peligro" titulo="Tono peligro">
            Tus canchas no reciben reservas.
          </Tarjeta>
          <Tarjeta tono="suave" titulo="Tono suave">
            Datos secundarios.
          </Tarjeta>
        </div>
      </Seccion>

      <Seccion titulo="Campos" codigo={'<Campo etiqueta="Celular" ayuda="…" error="…" />  ·  <CampoTexto …/>'}>
        <DemoCampos />
        <CampoTexto etiqueta="Descripción de la cancha" placeholder="Cuéntales a los jugadores qué incluye…" />
      </Seccion>

      <Seccion titulo="Insignias" codigo={'<Insignia tono="exito">Confirmada</Insignia>'}>
        <div className="flex flex-wrap gap-2">
          <Insignia tono="exito">Confirmada</Insignia>
          <Insignia tono="aviso">Pendiente de pago</Insignia>
          <Insignia tono="marca">Pago en revisión</Insignia>
          <Insignia tono="peligro">Cancelada</Insignia>
          <Insignia tono="neutro">Expirada</Insignia>
          <Insignia tono="banco">BCP</Insignia>
          <Insignia tono="solido">3</Insignia>
        </div>
      </Seccion>

      <Seccion titulo="Avisos" codigo={'<Aviso tono="error" titulo="…">…</Aviso>'}>
        <Aviso tono="info">Las recargas se revisan en unas horas.</Aviso>
        <Aviso tono="exito" titulo="¡Listo!">
          Sumamos S/ 20 a tu saldo.
        </Aviso>
        <Aviso tono="aviso">Te quedan 3 reservas. Recarga pronto.</Aviso>
        <Aviso tono="error">No se pudo guardar. Inténtalo de nuevo.</Aviso>
      </Seccion>

      <Seccion titulo="Cargando y vacío" codigo={'<Esqueleto alto="h-24" />  ·  <Vacio icono="📅" titulo="…" accion={…} />'}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Esqueleto alto="h-20" />
            <Esqueleto alto="h-10" />
          </div>
          <Vacio
            icono="📅"
            titulo="Aún no tienes reservas"
            texto="Busca una cancha cerca de ti y separa tu horario en minutos."
            accion={<Boton href="/">Buscar canchas</Boton>}
          />
        </div>
      </Seccion>

      <Seccion titulo="Ejemplo real: saldo del dueño" codigo="src/components/panel/saldo/* (datos de ejemplo)">
        <div className="mx-auto w-full max-w-xl">
          <DemoSaldo />
        </div>
      </Seccion>

      <Seccion titulo="Hooks" codigo="useConsulta · useEnVivo · useCopiar  (src/hooks)">
        <DemoCopiar />
        <pre className="overflow-x-auto rounded-xl bg-cancha-noche p-4 text-xs leading-relaxed text-white/90">
{`// Cargar datos con estados de carga y error
const { datos, error, cargando, recargar } = useConsulta((sb) => sb.rpc("mi_saldo"), []);

// Recargar cuando cambia la tabla (en vivo)
useEnVivo("reservas", recargar);

// Copiar al portapapeles
const { copiado, copiar } = useCopiar();`}
        </pre>
      </Seccion>
    </main>
  );
}
