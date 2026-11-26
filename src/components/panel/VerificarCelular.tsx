"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseNavegador } from "@/lib/sesionNavegador";
import ComprobarWhatsapp from "@/components/ComprobarWhatsapp";

const ESPERA = 60;

// Sin Meta: el rentador comprueba que su número tiene WhatsApp y EasyFut lo aprueba en /admin.
// Con Meta configurado (migración 007), NEXT_PUBLIC_VERIFICACION_AUTOMATICA=1 envía un código.
const AUTOMATICO = process.env.NEXT_PUBLIC_VERIFICACION_AUTOMATICA === "1";
const COMPROBADO = "easyfut:whatsapp-comprobado";

function traducir(msg: string, code?: string): string {
  if (/whatsapp_no_configurado|hook/i.test(msg))
    return "El envío por WhatsApp aún no está configurado (credenciales de Meta en el Vault y Send SMS Hook).";
  if (/provider|sms|twilio|messagebird|vonage|textlocal/i.test(msg) || code === "phone_provider_disabled")
    return "Falta activar el proveedor Phone en Supabase (Authentication → Sign In / Providers → Phone).";
  if (/already|exists|registered/i.test(msg) || code === "phone_exists")
    return "Ese número ya está verificado en otra cuenta.";
  if (/rate limit|too many|security purposes/i.test(msg)) return "Espera un momento antes de pedir otro código.";
  if (/expired|invalid|token/i.test(msg)) return "El código no es válido o ya expiró. Pide uno nuevo.";
  return "No pudimos completar la verificación. Inténtalo de nuevo.";
}

/** Verifica el celular del rentador con un código que llega por WhatsApp (Supabase Auth + Send SMS Hook). */
export default function VerificarCelular({ celularInicial }: { celularInicial?: string | null }) {
  const [celular, setCelular] = useState((celularInicial ?? "").replace(/\D/g, "").slice(-9));
  const [enviado, setEnviado] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [espera, setEspera] = useState(0);
  const codigoRef = useRef<HTMLInputElement>(null);
  const limpio = celular.replace(/\D/g, "");
  const valido = /^9\d{8}$/.test(limpio);
  const telefono = `+51${limpio}`;

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  // Número que el rentador ya comprobó; queda esperando la aprobación de EasyFut en /admin
  const [comprobado, setComprobado] = useState<string | null>(null);
  useEffect(() => {
    try {
      setComprobado(localStorage.getItem(COMPROBADO));
    } catch {}
  }, []);

  async function confirmarPropio() {
    const supabase = supabaseNavegador();
    if (!supabase || !valido) return;
    setOcupado(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // Se guarda como celular de contacto; el administrador lo aprueba en /admin
    const { error } = user
      ? await supabase.from("usuarios").update({ celular: limpio }).eq("id", user.id)
      : { error: new Error("sin_sesion") };
    setOcupado(false);
    if (error) return setError("No pudimos guardar tu número. Inténtalo de nuevo.");
    try {
      localStorage.setItem(COMPROBADO, limpio);
    } catch {}
    setComprobado(limpio);
  }

  async function enviar() {
    const supabase = supabaseNavegador();
    if (!supabase || !valido) return;
    setOcupado(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ phone: telefono });
    setOcupado(false);
    if (error) return setError(traducir(error.message, error.code));
    setEnviado(true);
    setCodigo("");
    setEspera(ESPERA);
    setTimeout(() => codigoRef.current?.focus(), 50);
  }

  async function verificar(token: string) {
    const supabase = supabaseNavegador();
    if (!supabase) return;
    setOcupado(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ phone: telefono, token, type: "phone_change" });
    if (error) {
      setOcupado(false);
      setCodigo("");
      return setError(traducir(error.message, error.code));
    }
    // El servidor vuelve a leer el perfil con el número ya verificado
    window.location.reload();
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#EDE9FE] text-[#6D28D9]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="6" y="2" width="12" height="20" rx="2" />
            <path d="M11 18h2" />
          </svg>
        </span>
        <div>
          <h2 className="font-bold">Confirma tu WhatsApp</h2>
          <p className="text-sm text-[#5A5A5A]">
            Para publicar canchas necesitas un número con WhatsApp: ahí te avisarán los clientes cuando paguen, y se
            mostrará en la página de tu cancha.
          </p>
        </div>
      </div>

      {!AUTOMATICO && comprobado ? (
        <div className="flex flex-col gap-2 rounded-xl bg-[#EDE9FE] p-4 text-sm text-[#6D28D9]">
          <p className="font-bold">✓ +51 {comprobado} tiene WhatsApp. Falta la aprobación de EasyFut.</p>
          <p className="text-[#4C1D95]">Te avisaremos por WhatsApp cuando esté aprobado; después ya podrás publicar tu cancha.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <button type="button" onClick={() => window.location.reload()} className="font-bold underline-offset-2 hover:underline">
              Ya me aprobaron · Actualizar
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.removeItem(COMPROBADO);
                } catch {}
                setComprobado(null);
              }}
              className="text-[#5A5A5A]"
            >
              Cambiar número
            </button>
          </div>
        </div>
      ) : !AUTOMATICO ? (
        <>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Tu número de WhatsApp
            <div className="flex items-stretch overflow-hidden rounded-xl border border-[#E3E3E3] focus-within:border-[#6D28D9]">
              <span className="flex items-center bg-[#F1EFF8] px-3 text-base font-normal text-[#5A5A5A]">+51</span>
              <input
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="987 654 321"
                maxLength={11}
                value={celular}
                onChange={(e) => setCelular(e.target.value)}
                className="min-w-0 flex-1 px-3 py-3 text-base font-normal outline-none"
              />
            </div>
            {celular && !valido && <span className="text-xs font-normal text-red-700">Debe tener 9 dígitos y empezar con 9.</span>}
          </label>
          <ComprobarWhatsapp numero={limpio} confirmado={false} ocupado={ocupado} onCambio={(si) => si && confirmarPropio()} />
        </>
      ) : !enviado ? (
        <>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Número de WhatsApp
            <div className="flex items-stretch overflow-hidden rounded-xl border border-[#E3E3E3] focus-within:border-[#6D28D9]">
              <span className="flex items-center bg-[#F1EFF8] px-3 text-base font-normal text-[#5A5A5A]">+51</span>
              <input
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="987 654 321"
                maxLength={11}
                value={celular}
                onChange={(e) => setCelular(e.target.value)}
                className="min-w-0 flex-1 px-3 py-3 text-base font-normal outline-none"
              />
            </div>
            {celular && !valido && <span className="text-xs font-normal text-red-700">Debe tener 9 dígitos y empezar con 9.</span>}
          </label>
          <button
            type="button"
            onClick={enviar}
            disabled={!valido || ocupado}
            className="rounded-xl bg-[#25D366] py-3 font-bold text-white disabled:opacity-50"
          >
            {ocupado ? "Enviando…" : "Enviarme un código por WhatsApp"}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-[#5A5A5A]">
            Te enviamos un código por WhatsApp al <strong className="text-[#1B1B1B]">+51 {limpio}</strong>. Ábrelo y
            escríbelo aquí (o toca &quot;Copiar código&quot; en el mensaje).
          </p>
          <input
            ref={codigoRef}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="••••••"
            maxLength={6}
            value={codigo}
            disabled={ocupado}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCodigo(v);
              if (v.length === 6) verificar(v);
            }}
            aria-label="Código de WhatsApp"
            className="w-full rounded-2xl border-2 border-[#E3E3E3] py-4 text-center font-mono text-3xl tracking-[0.5em] outline-none focus:border-[#6D28D9] disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => verificar(codigo)}
            disabled={codigo.length < 6 || ocupado}
            className="rounded-xl bg-[#6D28D9] py-3 font-bold text-white disabled:opacity-50"
          >
            {ocupado ? "Verificando…" : "Verificar"}
          </button>
          <div className="flex justify-between text-sm">
            <button type="button" onClick={() => setEnviado(false)} className="text-[#5A5A5A]">
              Cambiar número
            </button>
            <button
              type="button"
              onClick={enviar}
              disabled={espera > 0 || ocupado}
              className="font-bold text-[#6D28D9] disabled:font-normal disabled:text-[#8A968F]"
            >
              {espera > 0 ? `Reenviar en ${espera} s` : "Reenviar código"}
            </button>
          </div>
        </>
      )}

      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
