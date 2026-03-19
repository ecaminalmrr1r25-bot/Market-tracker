import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEEN_FILE = path.join(__dirname, 'seen.json');
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const KEYWORD = "seiko 5";
const MAX_PRICE = 400;       // opcional: filtra anuncios caros
const RESULTS_LIMIT = 20;    // cuántos anuncios mirar por ejecución

async function sendTelegramMessage(text) {
  if (!TELEGRAM_TOKEN || !CHAT_ID) {
    console.log("Faltan TELEGRAM_TOKEN o CHAT_ID → no se envía");
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  try {
    await axios.post(url, {
      chat_id: CHAT_ID,
      text: text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
    console.log("Mensaje enviado a Telegram");
  } catch (err) {
    console.error("Error enviando a Telegram:", err.response?.data || err.message);
  }
}

async function loadSeen() {
  try {
    const data = await fs.readFile(SEEN_FILE, 'utf8');
    return new Set(JSON.parse(data));
  } catch (err) {
    return new Set();
  }
}

async function saveSeen(seen) {
  await fs.writeFile(SEEN_FILE, JSON.stringify([...seen], null, 2));
}

async function main() {
  console.log(`Buscando "${KEYWORD}" en Wallapap...`);

  const seen = await loadSeen();
  let newItems = 0;

  try {
    // Endpoint real usado por wallapop web/app en 2025-2026 (puede cambiar → vigila)
    const url = `https://api.wallapop.com/api/v3/general/search`;

    const params = {
      keywords: KEYWORD,
      country_code: "ES",
      language: "es_ES",
      lat: 40.4167754,   // Madrid – cambia si quieres otra zona
      lng: -3.7037902,
      order_by: "newest",
      min_sale_price: 0,
      max_sale_price: MAX_PRICE,
      limit: RESULTS_LIMIT
    };

    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "application/json",
      "Accept-Language": "es-ES,es;q=0.9",
      "X-Requested-With": "XMLHttpRequest",
      "deviceOS": "web"
    };

    const response = await axios.get(url, { params, headers });
    const items = response.data?.search_objects || [];

    console.log(`Encontrados ${items.length} anuncios`);

    for (const item of items) {
      const id = item.id || item.web_slug;
      if (!id) continue;

      if (seen.has(id)) continue;

      seen.add(id);
      newItems++;

      const title = item.title || "Sin título";
      const price = item.price?.amount ? (item.price.amount / 100).toFixed(2) : "?";
      const urlAd = `https://es.wallapop.com/item/${item.web_slug || id}`;
      const desc = (item.description || "").substring(0, 120) + "...";

      const message = 
        `🆕 <b>Nuevo Seiko 5 en Wallapop!</b>\n\n` +
        `<b>${title}</b>\n` +
        `Precio: ${price} €\n` +
        `Ubicación: ${item.location?.city || "—"}\n` +
        `${desc}\n\n` +
        `🔗 ${urlAd}`;

      await sendTelegramMessage(message);
      // Pequeña pausa para no saturar Telegram
      await new Promise(r => setTimeout(r, 1500));
    }

    if (newItems === 0) {
      console.log("No hay novedades esta vez");
      // Opcional: await sendTelegramMessage("Wallapop check: sin novedades");
    } else {
      console.log(`→ Enviados ${newItems} anuncios nuevos`);
    }

    await saveSeen(seen);

  } catch (error) {
    console.error("Error en la petición:", error.message);
    if (error.response) {
      console.error(error.response.status, error.response.data);
    }
    // Opcional: enviar error a telegram
    // await sendTelegramMessage(`⚠️ Error en el scraper Wallapop: ${error.message}`);
  }
}

main().catch(console.error);