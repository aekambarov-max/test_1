import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { getCatalog, saveCatalog, syncFromSheet, startSheetSync } from './catalog.js';
import { createOrder, listOrders, markWhatsappOpened, forwardToSheets } from './orders.js';
import { validateOrder } from './validate.js';
import { buildOrderMessage, buildWhatsAppUrl } from './whatsapp.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const MAX_BODY_BYTES = 128 * 1024;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Тело запроса слишком большое'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('Некорректный JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function isAdmin(req) {
  if (!config.adminToken) return false;
  const provided = String(req.headers['x-admin-token'] || '');
  const a = Buffer.from(provided);
  const b = Buffer.from(config.adminToken);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireAdmin(req, res) {
  if (!config.adminToken) {
    sendJson(res, 503, { error: 'ADMIN_TOKEN не настроен на сервере' });
    return false;
  }
  if (!isAdmin(req)) {
    sendJson(res, 401, { error: 'Неверный токен доступа' });
    return false;
  }
  return true;
}

async function serveStatic(req, res, pathname) {
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = path.resolve(config.publicDir, relative);
  if (target !== config.publicDir && !target.startsWith(config.publicDir + path.sep)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }
  try {
    const stat = await fsp.stat(target);
    if (stat.isDirectory()) throw new Error('directory');
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    fs.createReadStream(target).pipe(res);
  } catch {
    // SPA: неизвестные пути отдают каталог, чтобы ссылка из рекламы всегда открывалась.
    if (!path.extname(relative)) {
      const html = await fsp.readFile(path.join(config.publicDir, 'index.html'));
      res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-cache' });
      res.end(html);
      return;
    }
    sendJson(res, 404, { error: 'Не найдено' });
  }
}

async function handleApi(req, res, pathname) {
  const method = req.method || 'GET';

  if (pathname === '/api/health' && method === 'GET') {
    const catalog = getCatalog();
    return sendJson(res, 200, {
      ok: true,
      products: catalog.products.length,
      catalogSource: catalog.source,
      catalogUpdatedAt: catalog.updatedAt,
      sheetsCatalog: Boolean(config.catalogSheetCsvUrl),
      sheetsOrders: Boolean(config.ordersWebhookUrl),
    });
  }

  if (pathname === '/api/catalog' && method === 'GET') {
    const catalog = getCatalog();
    return sendJson(res, 200, {
      updatedAt: catalog.updatedAt,
      categories: catalog.categories,
      products: catalog.products,
      settings: {
        currency: config.currency,
        minOrderAmount: config.minOrderAmount,
        whatsappPhone: config.whatsappPhone,
      },
    });
  }

  if (pathname === '/api/orders' && method === 'POST') {
    const payload = await readBody(req);
    const catalog = getCatalog();
    const result = validateOrder(payload, {
      products: catalog.products,
      minOrderAmount: config.minOrderAmount,
    });
    if (!result.valid) return sendJson(res, 400, { error: 'Проверьте форму', fields: result.errors });

    const order = await createOrder({
      customer: result.customer,
      items: result.items,
      total: result.total,
      meta: {
        source: String(payload?.meta?.source || '').slice(0, 60) || 'web',
        userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
      },
    });

    const message = buildOrderMessage(order, config.currency);
    const sheets = await forwardToSheets(order);

    return sendJson(res, 201, {
      number: order.number,
      total: order.total,
      currency: order.currency,
      whatsappUrl: buildWhatsAppUrl(config.whatsappPhone, message),
      whatsappText: message,
      savedToSheets: sheets.forwarded,
    });
  }

  const whatsappOpened = pathname.match(/^\/api\/orders\/([\w-]+)\/whatsapp-opened$/);
  if (whatsappOpened && method === 'POST') {
    const order = await markWhatsappOpened(whatsappOpened[1]);
    return sendJson(res, order ? 200 : 404, order ? { ok: true } : { error: 'Заказ не найден' });
  }

  if (pathname === '/api/admin/orders' && method === 'GET') {
    if (!requireAdmin(req, res)) return undefined;
    return sendJson(res, 200, { orders: listOrders({ limit: 200 }) });
  }

  if (pathname === '/api/admin/catalog' && method === 'GET') {
    if (!requireAdmin(req, res)) return undefined;
    return sendJson(res, 200, getCatalog());
  }

  if (pathname === '/api/admin/catalog' && method === 'PUT') {
    if (!requireAdmin(req, res)) return undefined;
    const payload = await readBody(req);
    if (!Array.isArray(payload?.products)) return sendJson(res, 400, { error: 'Ожидается поле products' });
    const catalog = await saveCatalog({ products: payload.products, categories: payload.categories });
    return sendJson(res, 200, catalog);
  }

  if (pathname === '/api/admin/catalog/sync' && method === 'POST') {
    if (!requireAdmin(req, res)) return undefined;
    try {
      const catalog = await syncFromSheet();
      return sendJson(res, 200, { ok: true, products: catalog.products.length, updatedAt: catalog.updatedAt });
    } catch (error) {
      return sendJson(res, 502, { error: error.message });
    }
  }

  return sendJson(res, 404, { error: 'Метод не найден' });
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    try {
      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url.pathname);
      } else {
        await serveStatic(req, res, url.pathname);
      }
    } catch (error) {
      if (res.headersSent) return;
      const status = error.status || 500;
      if (status === 500) console.error('[server]', error);
      sendJson(res, status, { error: status === 500 ? 'Внутренняя ошибка' : error.message });
    }
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isMain) {
  startSheetSync(console);
  createServer().listen(config.port, () => {
    console.log(`LIM mini-app: http://localhost:${config.port}`);
    console.log(`Админ-панель:  http://localhost:${config.port}/admin.html`);
    if (!config.whatsappPhone) console.warn('[config] WHATSAPP_PHONE не задан — ссылка откроет выбор чата вручную');
    if (!config.adminToken) console.warn('[config] ADMIN_TOKEN не задан — админ-панель отключена');
  });
}
