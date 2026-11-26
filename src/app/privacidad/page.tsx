import PaginaLegal, { type Seccion } from "@/components/PaginaLegal";

export const metadata = { title: "Política de privacidad" };

// BORRADOR basado en los datos que la app realmente guarda. Antes de lanzar, completa
// los [COMPLETAR] y revísalo con un abogado (Ley 29733 de Protección de Datos Personales).
const SECCIONES: Seccion[] = [
  {
    titulo: "Quién es responsable de tus datos",
    parrafos: ["Jhonell Jhonny Huamani Llallico, RUC 10607895045. Contacto: easyfutinquiries@gmail.com."],
  },
  {
    titulo: "Qué datos guardamos",
    parrafos: [
      "Jugadores: el nombre y el celular que escribes al reservar, y los datos de la reserva (cancha, fecha, hora, monto y estado). Si creas una cuenta, también tu correo.",
      "Rentadores: nombre, correo, número de WhatsApp, y la información de sus canchas (dirección, ubicación, fotos, horarios, precios y medios de pago).",
      "Datos técnicos: la dirección IP desde la que se hace una reserva, solo para evitar reservas falsas.",
      "Tu ubicación: si tocas \"Ver canchas cerca de mí\", tu ubicación se usa en tu propio celular para calcular distancias. No se envía ni se guarda en nuestros servidores.",
    ],
  },
  {
    titulo: "Para qué los usamos",
    parrafos: [
      "Para gestionar tus reservas, para que el rentador pueda contactarte y confirmar tu pago, y para prevenir abusos (por ejemplo, reservas falsas).",
      "No vendemos tus datos ni los usamos para publicidad de terceros.",
    ],
  },
  {
    titulo: "Quién puede verlos",
    parrafos: [
      "El rentador de la cancha que reservas ve tu nombre, tu celular y el historial de tus reservas en EasyFut (cuántas pagaste, dejaste vencer o fueron rechazadas).",
      "Cuando el rentador confirma tu pago en la app se abre un chat entre tú y ese rentador (uno solo para todas tus reservas con él). Solo lo ven ustedes dos; se puede escribir hasta 2 días después de su último partido. No compartas contraseñas ni códigos por ahí.",
      "El número de WhatsApp de cada rentador y los medios de pago de su cancha son públicos, porque los jugadores los necesitan para pagar y coordinar.",
      "Usamos Supabase como proveedor de base de datos y de cuentas, y OpenStreetMap para mostrar mapas.",
    ],
  },
  {
    titulo: "Cuánto tiempo y cómo los protegemos",
    parrafos: [
      "Guardamos los datos mientras tu cuenta esté activa o mientras sean necesarios para el historial de reservas. Las cuentas que no verifican su correo se eliminan.",
      "El acceso a los datos está restringido por reglas de seguridad en la base de datos: cada rentador solo ve lo de sus canchas y cada jugador solo lo suyo.",
    ],
  },
  {
    titulo: "Tus derechos",
    parrafos: [
      "Puedes pedir acceso, corrección o eliminación de tus datos, u oponerte a su uso, escribiendo a easyfutinquiries@gmail.com. Responderemos dentro de los plazos de la Ley 29733.",
    ],
  },
];

export default function Privacidad() {
  return (
    <PaginaLegal
      titulo="Política de privacidad"
      actualizado="noviembre de 2026"
      intro="Te contamos de forma clara qué datos guarda EasyFut, para qué y quién puede verlos."
      secciones={SECCIONES}
      otro={{ href: "/terminos", texto: "Términos y condiciones" }}
    />
  );
}
