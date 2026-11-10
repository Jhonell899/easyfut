export default function AvisoConfig() {
  return (
    <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
      Falta configurar Supabase. Completa <code>NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
      <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> en <code>.env.local</code> y reinicia
      el servidor.
    </p>
  );
}
