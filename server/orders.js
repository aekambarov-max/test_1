import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config, paths } from './config.js';

let writeQueue = Promise.resolve();

function readAll() {
  if (!fs.existsSync(paths.orders)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(paths.orders, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Битый файл не должен блокировать приём заказов — начинаем новый журнал.
    fs.renameSync(paths.orders, `${paths.orders}.corrupt-${Date.now()}`);
    return [];
  }
}

function nextOrderNumber(existing, now = new Date()) {
  const stamp = [
    String(now.getFullYear()).slice(2),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');
  const prefix = `LIM-${stamp}`;
  const todayCount = existing.filter((order) => String(order.number).startsWith(prefix)).length;
  return `${prefix}-${String(todayCount + 1).padStart(3, '0')}`;
}

async function persist(orders) {
  await fsp.mkdir(path.dirname(paths.orders), { recursive: true });
  const tmp = `${paths.orders}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(orders, null, 2), 'utf8');
  await fsp.rename(tmp, paths.orders);
}

/**
 * Заказ сначала записывается на диск и только потом отдаётся клиенту —
 * если WhatsApp-редирект не сработает, заказ всё равно не потеряется (НФТ «надёжность передачи»).
 */
export function createOrder({ customer, items, total, meta = {} }) {
  writeQueue = writeQueue.then(async () => {
    const orders = readAll();
    const order = {
      number: nextOrderNumber(orders),
      createdAt: new Date().toISOString(),
      status: 'new',
      customer,
      items,
      total,
      currency: config.currency,
      meta,
      whatsappSent: false,
    };
    orders.push(order);
    await persist(orders);
    return order;
  });
  return writeQueue;
}

export function listOrders({ limit = 100 } = {}) {
  return readAll().slice(-limit).reverse();
}

export function markWhatsappOpened(number) {
  writeQueue = writeQueue.then(async () => {
    const orders = readAll();
    const order = orders.find((item) => item.number === number);
    if (!order) return null;
    order.whatsappSent = true;
    await persist(orders);
    return order;
  });
  return writeQueue;
}

/** Дублирование заказа в Google Sheets через Apps Script. Ошибки не влияют на ответ клиенту. */
export async function forwardToSheets(order, log = console) {
  if (!config.ordersWebhookUrl) return { forwarded: false, reason: 'webhook-not-configured' };
  try {
    const response = await fetch(config.ordersWebhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        number: order.number,
        createdAt: order.createdAt,
        name: order.customer.name,
        phone: `+${order.customer.phone}`,
        address: order.customer.address,
        deliveryTime: order.customer.deliveryTime,
        paymentMethod: order.customer.paymentMethod,
        comment: order.customer.comment,
        items: order.items.map((item) => `${item.title} × ${item.qty}`).join('; '),
        total: order.total,
        currency: order.currency,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Sheets webhook ответил ${response.status}`);
    return { forwarded: true };
  } catch (error) {
    log.warn?.(`[orders] не удалось отправить ${order.number} в Sheets: ${error.message}`);
    return { forwarded: false, reason: error.message };
  }
}
