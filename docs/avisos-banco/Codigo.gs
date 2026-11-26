/**
 * EasyFut · Avisos del banco
 *
 * Este script vive en el Gmail donde te llegan las alertas del BCP (y de Yape, si
 * llegan por correo). Cada 5 minutos lee las alertas nuevas, saca el monto, el número
 * de operación, el nombre de quien pagó y su celular, y se los envía a EasyFut.
 * Si coinciden con una recarga de un dueño (mismo monto, nombre del dueño y mismo
 * número), la recarga se confirma sola.
 *
 * Instrucciones completas: docs/avisos-banco.md
 */

// ── 1. Configuración (complétala) ─────────────────────────────────────────────
const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';  // igual que NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = 'PEGA_AQUI_LA_CLAVE_PUBLICA';   // igual que NEXT_PUBLIC_SUPABASE_ANON_KEY
const CLAVE_AVISOS = 'PEGA_AQUI_LA_CLAVE_DE_AVISOS';      // /admin → Recargas → Generar clave

// true = solo muestra lo que entiende de cada correo (en "Ejecuciones"), sin enviar nada.
// Déjalo en true hasta comprobar que lee bien tus alertas; luego pásalo a false.
const SOLO_PRUEBA = true;

// Qué correos leer. Ajusta "from:" al remitente real de tus alertas.
const BUSQUEDAS = [
  { medio: 'bcp', consulta: 'from:(bcp) newer_than:3d' },
  // { medio: 'yape', consulta: 'from:(yape) newer_than:3d' },
];

const ETIQUETA_LISTO = 'easyfut-procesado';

// ── 2. Lectura de cada correo ────────────────────────────────────────────────
// Busca los datos con varias formas comunes de escribirlos. Si tu alerta los escribe
// distinto, mándale un ejemplo (sin datos personales) al desarrollador para ajustarlo.
function leerAlerta(texto) {
  const t = texto.replace(/\s+/g, ' ');
  const monto = buscar(t, [
    /(?:monto|importe|recibiste|abonado|transferencia de)\D{0,25}S\/\s?([\d.,]+)/i,
    /S\/\s?([\d.,]+)/i,
  ]);
  const operacion = buscar(t, [
    /(?:n[uú]mero|nro\.?|n°)\s*(?:de\s*)?operaci[oó]n\s*:?\s*([A-Z0-9-]{4,20})/i,
    /operaci[oó]n\s*:?\s*([0-9]{4,20})/i,
  ]);
  const nombre = buscar(t, [
    /(?:ordenante|remitente|enviado por|de parte de|cliente)\s*:?\s*([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ.' ]{3,60}?)(?=\s{0,2}(?:con|desde|por|monto|nro|n°|operaci|cuenta|celular|$))/i,
    /([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ.]+(?: [A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ.]+){1,4}) te (?:envi[oó]|yape[oó])/,
  ]);
  const celular = buscar(t, [
    /(?:celular|n[uú]mero|desde el)\s*:?\s*\*{0,6}(\d{3,9})/i,
  ]);
  return {
    monto: monto ? Number(monto.replace(/,/g, '')) : null,
    operacion: operacion || null,
    nombre: nombre ? nombre.trim() : null,
    celular: celular || null,
  };
}

function buscar(texto, patrones) {
  for (const p of patrones) {
    const m = texto.match(p);
    if (m && m[1]) return m[1];
  }
  return null;
}

// ── 3. Proceso principal (el activador lo ejecuta cada 5 minutos) ──────────────
function revisarAlertas() {
  const etiqueta = GmailApp.getUserLabelByName(ETIQUETA_LISTO) || GmailApp.createLabel(ETIQUETA_LISTO);

  BUSQUEDAS.forEach(function (b) {
    const hilos = GmailApp.search(b.consulta + ' -label:' + ETIQUETA_LISTO, 0, 30);
    hilos.forEach(function (hilo) {
      hilo.getMessages().forEach(function (correo) {
        const datos = leerAlerta(correo.getPlainBody() || correo.getBody());
        const fecha = correo.getDate().toISOString();
        Logger.log('%s | %s | %s', b.medio, correo.getSubject(), JSON.stringify(datos));

        if (SOLO_PRUEBA) return;
        if (!datos.monto || !datos.nombre) {
          Logger.log('  → no se entendió el monto o el nombre: se deja para revisión manual');
          return;
        }
        const respuesta = enviarAviso(b.medio, datos, fecha);
        Logger.log('  → EasyFut respondió: %s', respuesta);
      });
      if (!SOLO_PRUEBA) hilo.addLabel(etiqueta);
    });
  });
}

function enviarAviso(medio, datos, fecha) {
  const r = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/aviso_banco', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
    payload: JSON.stringify({
      p_clave: CLAVE_AVISOS,
      p_medio: medio,
      p_monto: datos.monto,
      p_operacion: datos.operacion,
      p_nombre: datos.nombre,
      p_celular: datos.celular,
      p_fecha: fecha,
    }),
    muteHttpExceptions: true,
  });
  return r.getResponseCode() + ' ' + r.getContentText();
}

// Ejecuta esto UNA vez para que el script corra solo cada 5 minutos.
function crearActivador() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'revisarAlertas') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('revisarAlertas').timeBased().everyMinutes(5).create();
}
