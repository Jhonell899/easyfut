import PaginaLegal, { type Seccion } from "@/components/PaginaLegal";

export const metadata = { title: "Términos y condiciones" };

// BORRADOR: describe cómo funciona hoy la app. Antes de lanzar, completa los datos
// marcados con [COMPLETAR] y hazlo revisar por un abogado.
const SECCIONES: Seccion[] = [
  {
    titulo: "Qué es EasyFut",
    parrafos: [
      "EasyFut es una plataforma que conecta a jugadores con dueños de canchas deportivas (\"rentadores\") para reservar horarios. EasyFut no es dueña de las canchas ni presta el servicio de alquiler: ese servicio lo presta cada rentador.",
      "Responsable de la plataforma: Jhonell Jhonny Huamani Llallico, RUC 10607895045. Contacto: easyfutinquiries@gmail.com.",
    ],
  },
  {
    titulo: "Cuentas",
    parrafos: [
      "Puedes reservar sin cuenta. Para publicar canchas necesitas una cuenta con correo verificado y un número de WhatsApp confirmado.",
      "Eres responsable de la veracidad de tus datos y del uso de tu cuenta. Un rentador puede invitar encargados, que actúan en su nombre.",
    ],
  },
  {
    titulo: "Reservas y pagos",
    parrafos: [
      "Al reservar, el horario queda separado por 10 minutos. En ese tiempo debes pagar directamente al rentador (Yape, Plin o transferencia) y avisarle con el botón \"Ya pagué\". Si no lo haces, el horario se libera.",
      "El pago se hace directamente al rentador: EasyFut no recibe, retiene ni procesa tu dinero. La reserva queda confirmada cuando el rentador confirma que recibió el pago.",
      "Puedes cancelar tu reserva desde la app mientras no hayas avisado el pago, sin costo.",
      "Después de pagar, cada cancha aplica una de tres políticas de cancelación fijas (Flexible, Moderada o Estricta), que ves antes de reservar. La devolución que corresponda la hace el rentador por el mismo medio de pago, en un máximo de 48 horas.",
      "En todas las canchas, si el rentador cancela o la cancha no se puede usar, recibes la devolución completa o eliges otro horario. Si no llegas sin avisar, no hay devolución.",
    ],
  },
  {
    titulo: "Uso correcto",
    parrafos: [
      "No está permitido hacer reservas falsas, avisar pagos que no se hicieron, usar números de otras personas ni publicar canchas que no administras.",
      "Para proteger a los demás usuarios hay límites automáticos de reservas sin pagar, y los rentadores o EasyFut pueden bloquear números que incumplan estas reglas.",
    ],
  },
  {
    titulo: "Responsabilidad",
    parrafos: [
      "Cada rentador es responsable de la información de su cancha (precios, horarios, fotos, medios de pago), de su estado y de la atención en el local.",
      "EasyFut no responde por pagos enviados a un destinatario equivocado, por incumplimientos entre jugador y rentador ni por lesiones o daños ocurridos en las canchas.",
    ],
  },
  {
    titulo: "Cambios y contacto",
    parrafos: [
      "Podemos actualizar estos términos; la fecha de arriba indica la última versión. Si sigues usando EasyFut después de un cambio, se entiende que lo aceptas.",
      "Consultas y reclamos: easyfutinquiries@gmail.com.",
    ],
  },
];

export default function Terminos() {
  return (
    <PaginaLegal
      titulo="Términos y condiciones"
      actualizado="noviembre de 2026"
      intro="Al usar EasyFut aceptas estas condiciones. Están escritas en lenguaje sencillo para que sepas exactamente cómo funciona."
      secciones={SECCIONES}
      otro={{ href: "/privacidad", texto: "Política de privacidad" }}
    />
  );
}
