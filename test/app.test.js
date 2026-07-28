import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Изолируем данные теста от рабочих файлов: конфиг читает env при импорте.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lim-test-'));
process.env.DATA_DIR = tmpDir;
process.env.WHATSAPP_PHONE = '+7 701 234 56 78';
process.env.MIN_ORDER_AMOUNT = '5000';
process.env.CURRENCY = '₸';
process.env.ADMIN_TOKEN = 'test-token';
process.env.CATALOG_SHEET_CSV_URL = '';
process.env.ORDERS_WEBHOOK_URL = '';

const { parseCsvToObjects } = await import('../server/csv.js');
const { normalizePhone, isValidPhone, validateOrder } = await import('../server/validate.js');
const { buildOrderMessage, buildWhatsAppUrl } = await import('../server/whatsapp.js');
const { createOrder, listOrders, markWhatsappOpened } = await import('../server/orders.js');
const { getCatalog, normalizeProduct } = await import('../server/catalog.js');
const { createServer } = await import('../server/index.js');

const products = [
  { id: 'milk', title: 'Молоко', price: 900, unit: 'л', inStock: true },
  { id: 'butter', title: 'Масло', price: 3400, unit: '0,5 кг', inStock: true },
  { id: 'smetana', title: 'Сметана', price: 1800, unit: '0,5 л', inStock: false },
];

const validCustomer = {
  name: 'Айгуль',
  phone: '+7 701 234 56 78',
  address: 'ул. Кабанбай батыра 53, кв. 12',
  deliveryTime: 'Завтра, 10:00–14:00',
  paymentMethod: 'cash',
  comment: 'Домофон 12К',
};

test('CSV: кавычки, запятые и переводы строк внутри полей', () => {
  const csv = 'id,title,price\nmilk,"Молоко, 3,2%",900\neggs,"Яйца ""домашние""",1600\n';
  const rows = parseCsvToObjects(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, 'Молоко, 3,2%');
  assert.equal(rows[1].title, 'Яйца "домашние"');
  assert.equal(rows[1].price, '1600');
});

test('телефон нормализуется к формату 77XXXXXXXXX', () => {
  assert.equal(normalizePhone('+7 (701) 234-56-78'), '77012345678');
  assert.equal(normalizePhone('8 701 234 56 78'), '77012345678');
  assert.equal(normalizePhone('7012345678'), '77012345678');
  assert.ok(isValidPhone('+7 701 234 56 78'));
  assert.ok(!isValidPhone('+7 601 234 56 78'));
  assert.ok(!isValidPhone('123'));
});

test('валидация заказа: суммы считает сервер, а не клиент', () => {
  const result = validateOrder(
    { customer: validCustomer, items: [{ id: 'milk', qty: 2, price: 1 }, { id: 'butter', qty: 1 }] },
    { products, minOrderAmount: 5000 },
  );
  assert.ok(result.valid, JSON.stringify(result.errors));
  assert.equal(result.total, 900 * 2 + 3400);
  assert.equal(result.customer.phone, '77012345678');
});

test('валидация заказа: пустые поля, отсутствие в наличии, минимальная сумма', () => {
  const emptyForm = validateOrder({ customer: {}, items: [] }, { products, minOrderAmount: 0 });
  assert.ok(!emptyForm.valid);
  assert.deepEqual(Object.keys(emptyForm.errors).sort(), ['address', 'deliveryTime', 'items', 'name', 'phone']);

  const outOfStock = validateOrder(
    { customer: validCustomer, items: [{ id: 'smetana', qty: 1 }] },
    { products, minOrderAmount: 0 },
  );
  assert.match(outOfStock.errors.items, /Сметана/);

  const belowMin = validateOrder(
    { customer: validCustomer, items: [{ id: 'milk', qty: 1 }] },
    { products, minOrderAmount: 5000 },
  );
  assert.ok(belowMin.errors.total);

  const badQty = validateOrder(
    { customer: validCustomer, items: [{ id: 'milk', qty: 0 }] },
    { products, minOrderAmount: 0 },
  );
  assert.ok(badQty.errors.items);
});

test('сообщение и ссылка для WhatsApp содержат состав заказа', () => {
  const order = {
    number: 'LIM-260727-001',
    customer: { ...validCustomer, phone: '77012345678' },
    items: [{ title: 'Молоко', qty: 2, unit: 'л', price: 900, sum: 1800 }],
    total: 1800,
  };
  const message = buildOrderMessage(order, '₸');
  assert.match(message, /LIM-260727-001/);
  assert.match(message, /Молоко — 2 × л/);
  assert.match(message, /Итого/);
  assert.match(message, /Домофон 12К/);

  const url = buildWhatsAppUrl('+7 701 234 56 78', message);
  assert.ok(url.startsWith('https://wa.me/77012345678?text='));
  assert.equal(decodeURIComponent(url.split('text=')[1]), message);
});

test('каталог из seed нормализуется и сортируется', () => {
  const catalog = getCatalog();
  assert.ok(catalog.products.length >= 5);
  assert.ok(catalog.categories.length >= 3);
  const sorted = [...catalog.products].sort((a, b) => a.sort - b.sort);
  assert.deepEqual(catalog.products.map((p) => p.id), sorted.map((p) => p.id));
  assert.ok(catalog.products.every((p) => typeof p.price === 'number' && p.image));
});

test('строка из Google Sheets превращается в товар', () => {
  const product = normalizeProduct({
    title: 'Мёд гречишный',
    category: 'Мёд',
    price: '5 200 ₸',
    unit: 'кг',
    instock: 'да',
    image: '',
  });
  assert.equal(product.id, 'med-grechishnyy');
  assert.equal(product.category, 'med');
  assert.equal(product.price, 5200);
  assert.equal(product.inStock, true);
  assert.equal(product.image, '/img/placeholder.svg');
});

test('заказы нумеруются по дате и сохраняются на диск', async () => {
  const first = await createOrder({ customer: { ...validCustomer, phone: '77012345678' }, items: [], total: 0 });
  const second = await createOrder({ customer: { ...validCustomer, phone: '77012345678' }, items: [], total: 0 });
  assert.match(first.number, /^LIM-\d{6}-001$/);
  assert.equal(Number(second.number.split('-')[2]), 2);

  await markWhatsappOpened(first.number);
  const stored = listOrders();
  assert.equal(stored.length, 2);
  assert.equal(stored.find((order) => order.number === first.number).whatsappSent, true);
  assert.ok(fs.existsSync(path.join(tmpDir, 'orders.json')));
});

/* ---------- HTTP ---------- */

async function withServer(run) {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('HTTP: каталог, оформление заказа и админ-доступ', async () => {
  await withServer(async (base) => {
    const catalogResponse = await fetch(`${base}/api/catalog`);
    const catalog = await catalogResponse.json();
    assert.equal(catalogResponse.status, 200);
    assert.ok(catalog.products.length > 0);
    assert.equal(catalog.settings.minOrderAmount, 5000);

    const inStock = catalog.products.filter((product) => product.inStock);
    // Количество подобрано так, чтобы гарантированно превысить minOrderAmount (5000) на любом наборе цен seed-каталога.
    const items = [{ id: inStock[0].id, qty: 5 }, { id: inStock[1].id, qty: 3 }];
    const expected = inStock[0].price * 5 + inStock[1].price * 3;

    const orderResponse = await fetch(`${base}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customer: validCustomer, items }),
    });
    const order = await orderResponse.json();
    assert.equal(orderResponse.status, 201, JSON.stringify(order));
    assert.equal(order.total, expected);
    assert.ok(order.whatsappUrl.includes('wa.me/77012345678'));
    assert.match(order.whatsappText, new RegExp(inStock[0].title));

    // Клиент не может подделать цену.
    const cheatResponse = await fetch(`${base}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customer: validCustomer, items, price: 1 }),
    });
    const cheat = await cheatResponse.json();
    assert.equal(cheatResponse.status, 201, JSON.stringify(cheat));
    assert.equal(cheat.total, expected);

    const invalidResponse = await fetch(`${base}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customer: { ...validCustomer, phone: '123' }, items }),
    });
    assert.equal(invalidResponse.status, 400);
    assert.ok((await invalidResponse.json()).fields.phone);

    assert.equal((await fetch(`${base}/api/admin/orders`)).status, 401);
    const adminResponse = await fetch(`${base}/api/admin/orders`, { headers: { 'x-admin-token': 'test-token' } });
    assert.equal(adminResponse.status, 200);
    assert.ok((await adminResponse.json()).orders.length > 0);

    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/../server/config.js`)).status, 404);
  });
});
