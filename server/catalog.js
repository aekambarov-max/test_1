import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config, paths } from './config.js';
import { parseCsvToObjects } from './csv.js';

const TRUTHY = new Set(['1', 'true', 'да', 'yes', 'y', 'в наличии', 'есть', '+']);

let cache = null;

function slugify(value) {
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
    й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
    у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
    э: 'e', ю: 'yu', я: 'ya',
  };
  return String(value)
    .toLowerCase()
    .split('')
    .map((char) => (char in map ? map[char] : char))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? '').replace(/[^\d.,-]/g, '').replace(',', '.');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBool(value, fallback = true) {
  if (typeof value === 'boolean') return value;
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === '') return fallback;
  return TRUTHY.has(raw);
}

export function normalizeProduct(raw, index = 0) {
  const title = String(raw.title ?? raw['название'] ?? '').trim();
  if (!title) return null;
  const categoryRaw = String(raw.category ?? raw['категория'] ?? '').trim();
  return {
    id: String(raw.id || slugify(title)).trim(),
    title,
    category: categoryRaw ? slugify(categoryRaw) : 'other',
    categoryTitle: categoryRaw || 'Прочее',
    price: Math.max(0, Math.round(toNumber(raw.price ?? raw['цена']))),
    unit: String(raw.unit ?? raw['единица'] ?? 'шт').trim() || 'шт',
    farmer: String(raw.farmer ?? raw['фермер'] ?? '').trim(),
    story: String(raw.story ?? raw['история'] ?? '').trim(),
    description: String(raw.description ?? raw['описание'] ?? '').trim(),
    image: String(raw.image ?? raw['фото'] ?? '').trim() || '/img/placeholder.svg',
    inStock: toBool(raw.inStock ?? raw.instock ?? raw['наличие'], true),
    sort: toNumber(raw.sort ?? raw['порядок']) || (index + 1) * 10,
  };
}

function buildCatalog(products, { source, categories }) {
  const normalized = products
    .map((product, index) => normalizeProduct(product, index))
    .filter(Boolean)
    .sort((a, b) => a.sort - b.sort);

  // Категории: берём из явного списка, недостающие достраиваем из товаров.
  const byId = new Map();
  for (const category of categories ?? []) {
    if (category?.id && category?.title) byId.set(category.id, { id: category.id, title: category.title });
  }
  for (const product of normalized) {
    if (!byId.has(product.category)) {
      byId.set(product.category, { id: product.category, title: product.categoryTitle || 'Прочее' });
    }
  }
  const used = new Set(normalized.map((p) => p.category));

  return {
    updatedAt: new Date().toISOString(),
    source,
    categories: [...byId.values()].filter((category) => used.has(category.id)),
    products: normalized.map(({ categoryTitle, ...product }) => product),
  };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function writeCatalog(catalog) {
  await fsp.mkdir(path.dirname(paths.catalog), { recursive: true });
  const tmp = `${paths.catalog}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(catalog, null, 2), 'utf8');
  await fsp.rename(tmp, paths.catalog);
  cache = catalog;
  return catalog;
}

export function getCatalog() {
  if (cache) return cache;
  const file = fs.existsSync(paths.catalog) ? paths.catalog : paths.catalogSeed;
  const raw = readJson(file);
  cache = buildCatalog(raw.products, { source: raw.source || 'seed', categories: raw.categories });
  cache.updatedAt = raw.updatedAt || cache.updatedAt;
  return cache;
}

export function getProduct(id) {
  return getCatalog().products.find((product) => product.id === id) || null;
}

export async function saveCatalog({ products, categories }) {
  return writeCatalog(buildCatalog(products, { source: 'admin', categories }));
}

// Импорт каталога из опубликованного Google Sheet (формат CSV).
export async function syncFromSheet(url = config.catalogSheetCsvUrl) {
  if (!url) throw new Error('CATALOG_SHEET_CSV_URL не задан');
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Google Sheets ответил ${response.status}`);
  const rows = parseCsvToObjects(await response.text());
  const catalog = buildCatalog(rows, { source: 'google-sheets' });
  if (catalog.products.length === 0) throw new Error('В таблице нет товаров — каталог не перезаписан');
  return writeCatalog(catalog);
}

export function startSheetSync(log = console) {
  if (!config.catalogSheetCsvUrl) return null;
  const run = () =>
    syncFromSheet()
      .then((catalog) => log.info?.(`[catalog] синхронизировано из Sheets: ${catalog.products.length} товаров`))
      // Ошибка синхронизации не должна ронять сервис — работаем на последнем удачном каталоге.
      .catch((error) => log.warn?.(`[catalog] синхронизация не удалась: ${error.message}`));
  run();
  if (config.catalogSyncIntervalMs > 0) {
    const timer = setInterval(run, config.catalogSyncIntervalMs);
    timer.unref?.();
    return timer;
  }
  return null;
}

export function resetCatalogCache() {
  cache = null;
}
