/** Se muestra mientras carga cualquier página: la app nunca queda en blanco. */
export default function Cargando() {
  return (
    <div className="min-h-screen" aria-busy="true" aria-label="Cargando">
      <div className="fondo-cancha h-40" />
      <div className="mx-auto -mt-8 flex max-w-xl flex-col gap-4 px-5">
        <div className="h-24 animate-pulse rounded-2xl bg-white" />
        <div className="h-56 animate-pulse rounded-2xl bg-white" />
        <div className="h-56 animate-pulse rounded-2xl bg-white" />
      </div>
    </div>
  );
}
