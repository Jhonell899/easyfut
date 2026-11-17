/** Estrellas de 1 a 5 (solo lectura). */
export default function Estrellas({ valor, tam = 16 }: { valor: number; tam?: number }) {
  const redondo = Math.round(valor * 2) / 2;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${valor.toFixed(1)} de 5 estrellas`} role="img">
      {[1, 2, 3, 4, 5].map((i) => {
        const lleno = redondo >= i ? 1 : redondo >= i - 0.5 ? 0.5 : 0;
        return (
          <svg key={i} width={tam} height={tam} viewBox="0 0 24 24" aria-hidden="true">
            <defs>
              <linearGradient id={`m${i}-${tam}`}>
                <stop offset={`${lleno * 100}%`} stopColor="#F59E0B" />
                <stop offset={`${lleno * 100}%`} stopColor="#E5E7EB" />
              </linearGradient>
            </defs>
            <path
              d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z"
              fill={`url(#m${i}-${tam})`}
            />
          </svg>
        );
      })}
    </span>
  );
}
