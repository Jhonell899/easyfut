/**
 * Dueño de la cancha. El nombre se muestra siempre; los botones de llamar y
 * WhatsApp solo si su número está aprobado (`celular` no vacío).
 */
export default function ContactoDueno({
  nombre,
  celular,
  cancha,
}: {
  nombre: string | null;
  celular: string | null;
  cancha: string;
}) {
  const mensaje = encodeURIComponent(`Hola, te escribo por la cancha ${cancha} que vi en EasyFut.`);
  const bonito = celular?.replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");
  const visible = nombre?.trim() || "Dueño de la cancha";

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-bold text-[#1B1B1B]">Dueño</h2>
      <div className="flex flex-col gap-3 rounded-2xl border border-[#E3E3E3] bg-white p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] text-lg font-bold text-[#6D28D9]">
            {visible.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold text-[#1B1B1B]">{visible}</p>
            {celular ? (
              <p className="flex items-center gap-1.5 text-sm text-[#5A5A5A]">
                +51 {bonito}
                <span className="rounded-full bg-[#DCF5EA] px-1.5 py-0.5 text-[10px] font-bold text-[#0F7A55]">✓ WhatsApp</span>
              </p>
            ) : (
              <p className="text-sm text-[#8A968F]">Contacto disponible después de reservar</p>
            )}
          </div>
        </div>

        {celular && (
          <div className="grid grid-cols-2 gap-2">
            <a
              href={`tel:+51${celular}`}
              className="flex items-center justify-center gap-2 rounded-xl border border-[#6D28D9] py-2.5 text-sm font-bold text-[#6D28D9]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
              </svg>
              Llamar
            </a>
            <a
              href={`https://wa.me/51${celular}?text=${mensaje}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] py-2.5 text-sm font-bold text-white"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z" />
              </svg>
              WhatsApp
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
