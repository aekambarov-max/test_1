import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Минималистичный загрузчик .env — чтобы не тащить зависимость ради пяти строк.
function loadEnvFile() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile();

const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: num(process.env.PORT, 3000),
  whatsappPhone: (process.env.WHATSAPP_PHONE || '').replace(/\D/g, ''),
  currency: process.env.CURRENCY || '₸',
  minOrderAmount: num(process.env.MIN_ORDER_AMOUNT, 0),
  adminToken: process.env.ADMIN_TOKEN || '',
  catalogSheetCsvUrl: process.env.CATALOG_SHEET_CSV_URL || '',
  catalogSyncIntervalMs: num(process.env.CATALOG_SYNC_INTERVAL_MS, 300000),
  ordersWebhookUrl: process.env.ORDERS_WEBHOOK_URL || '',
  dataDir: process.env.DATA_DIR || path.join(ROOT, 'data'),
  publicDir: path.join(ROOT, 'public'),
};

export const paths = {
  catalog: path.join(config.dataDir, 'catalog.json'),
  // Seed всегда читается из репозитория, а не из переопределяемого DATA_DIR.
  catalogSeed: path.join(ROOT, 'data', 'catalog.seed.json'),
  orders: path.join(config.dataDir, 'orders.json'),
};
