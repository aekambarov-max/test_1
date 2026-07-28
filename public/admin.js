const TOKEN_KEY = 'lim.admin.token';
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let token = localStorage.getItem(TOKEN_KEY) || '';
let catalog = { products: [], categories: [] };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', 'x-admin-token': token, ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Ошибка ${response.status}`);
  return data;
}

function status(el, message, kind = '') {
  el.textContent = message;
  el.className = `status ${kind ? `status--${kind}` : ''}`;
}

/* ---------- каталог ---------- */

function productRow(product, index) {
  const categoryTitle =
    catalog.categories.find((category) => category.id === product.category)?.title || product.category || '';
  return `
  <div class="prow" data-index="${index}">
    <div class="prow__head">
      <input data-key="title" value="${escapeHtml(product.title)}" placeholder="Название" />
      <label class="prow__switch"><input type="checkbox" data-key="inStock" ${product.inStock ? 'checked' : ''} /> в наличии</label>
      <button class="link-danger" type="button" data-delete>Удалить</button>
    </div>
    <div class="prow__grid">
      <label>Категория<input data-key="categoryTitle" value="${escapeHtml(categoryTitle)}" placeholder="Молочка" /></label>
      <label>Цена<input data-key="price" type="number" min="0" step="10" value="${escapeHtml(product.price)}" /></label>
      <label>Единица<input data-key="unit" value="${escapeHtml(product.unit)}" placeholder="кг / л / шт" /></label>
      <label>Порядок<input data-key="sort" type="number" step="10" value="${escapeHtml(product.sort)}" /></label>
      <label>Фермер<input data-key="farmer" value="${escapeHtml(product.farmer)}" /></label>
      <label>Фото (URL)<input data-key="image" value="${escapeHtml(product.image)}" /></label>
      <label style="grid-column: 1 / -1">Описание<textarea data-key="description" rows="2">${escapeHtml(product.description)}</textarea></label>
      <label style="grid-column: 1 / -1">История фермера<textarea data-key="story" rows="2">${escapeHtml(product.story)}</textarea></label>
    </div>
  </div>`;
}

function renderCatalog() {
  $('#product-rows').innerHTML = catalog.products.map(productRow).join('');
}

function collectProducts() {
  return $$('#product-rows .prow').map((row) => {
    const index = Number(row.dataset.index);
    const source = catalog.products[index] || {};
    const values = {};
    row.querySelectorAll('[data-key]').forEach((input) => {
      values[input.dataset.key] = input.type === 'checkbox' ? input.checked : input.value;
    });
    return {
      id: source.id,
      title: values.title,
      category: values.categoryTitle,
      price: values.price,
      unit: values.unit,
      farmer: values.farmer,
      story: values.story,
      description: values.description,
      image: values.image,
      inStock: values.inStock,
      sort: values.sort,
    };
  });
}

async function loadCatalog() {
  catalog = await api('/api/admin/catalog');
  renderCatalog();
  status($('#catalog-status'), `${catalog.products.length} товаров · источник: ${catalog.source}`);
}

async function saveCatalog() {
  try {
    catalog = await api('/api/admin/catalog', { method: 'PUT', body: JSON.stringify({ products: collectProducts() }) });
    renderCatalog();
    status($('#catalog-status'), 'Каталог сохранён и уже виден клиентам', 'ok');
  } catch (error) {
    status($('#catalog-status'), error.message, 'error');
  }
}

/* ---------- заказы ---------- */

let orders = [];

async function loadOrders() {
  try {
    const data = await api('/api/admin/orders');
    orders = data.orders;
    $('#order-rows').innerHTML = orders.length
      ? orders
          .map(
            (order) => `
        <div class="orow">
          <div class="orow__head">
            <span>${escapeHtml(order.number)}
              <span class="pill ${order.whatsappSent ? '' : 'pill--pending'}">${order.whatsappSent ? 'ушёл в WhatsApp' : 'WhatsApp не открыт'}</span>
            </span>
            <span>${escapeHtml(order.total.toLocaleString('ru-RU'))} ${escapeHtml(order.currency)}</span>
          </div>
          <div class="orow__meta">
            ${new Date(order.createdAt).toLocaleString('ru-RU')} · ${escapeHtml(order.customer.name)} ·
            <a href="tel:+${escapeHtml(order.customer.phone)}">+${escapeHtml(order.customer.phone)}</a>
          </div>
          <div class="orow__meta">${escapeHtml(order.customer.address)} · ${escapeHtml(order.customer.deliveryTime)} ·
            ${order.customer.paymentMethod === 'transfer' ? 'перевод' : 'наличные'}</div>
          ${order.customer.comment ? `<div class="orow__meta">Комментарий: ${escapeHtml(order.customer.comment)}</div>` : ''}
          <ul>${order.items.map((item) => `<li>${escapeHtml(item.title)} × ${item.qty} — ${escapeHtml(item.sum.toLocaleString('ru-RU'))}</li>`).join('')}</ul>
        </div>`,
          )
          .join('')
      : '<p class="empty">Заказов пока нет</p>';
    status($('#orders-status'), `Всего показано: ${orders.length}`);
  } catch (error) {
    status($('#orders-status'), error.message, 'error');
  }
}

function exportOrders() {
  const header = ['Номер', 'Дата', 'Имя', 'Телефон', 'Адрес', 'Время', 'Оплата', 'Комментарий', 'Состав', 'Сумма'];
  const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = orders.map((order) => [
    order.number,
    new Date(order.createdAt).toLocaleString('ru-RU'),
    order.customer.name,
    `+${order.customer.phone}`,
    order.customer.address,
    order.customer.deliveryTime,
    order.customer.paymentMethod === 'transfer' ? 'перевод' : 'наличные',
    order.customer.comment,
    order.items.map((item) => `${item.title} x${item.qty}`).join('; '),
    order.total,
  ]);
  const csv = '﻿' + [header, ...rows].map((row) => row.map(cell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: `lim-orders-${Date.now()}.csv` });
  link.click();
  URL.revokeObjectURL(url);
}

/* ---------- вход и вкладки ---------- */

async function enter() {
  try {
    await loadCatalog();
    localStorage.setItem(TOKEN_KEY, token);
    $('#auth').hidden = true;
    $('#workspace').hidden = false;
    $('#logout').hidden = false;
    loadOrders();
  } catch (error) {
    status($('#auth-error'), error.message, 'error');
    $('#auth-error').hidden = false;
    $('#auth').hidden = false;
    $('#workspace').hidden = true;
  }
}

$('#login').addEventListener('click', () => {
  token = $('#token').value.trim();
  $('#auth-error').hidden = true;
  enter();
});
$('#token').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') $('#login').click();
});
$('#logout').addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
});

$$('.tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    $$('.tab').forEach((other) => other.setAttribute('aria-pressed', String(other === tab)));
    $('#tab-catalog').hidden = tab.dataset.tab !== 'catalog';
    $('#tab-orders').hidden = tab.dataset.tab !== 'orders';
  }),
);

$('#save-catalog').addEventListener('click', saveCatalog);
$('#add-product').addEventListener('click', () => {
  catalog.products.push({
    id: '',
    title: 'Новый товар',
    category: '',
    price: 0,
    unit: 'шт',
    farmer: '',
    story: '',
    description: '',
    image: '/img/placeholder.svg',
    inStock: true,
    sort: (catalog.products.length + 1) * 10,
  });
  renderCatalog();
});
$('#product-rows').addEventListener('click', (event) => {
  const row = event.target.closest('.prow');
  if (!row || !event.target.matches('[data-delete]')) return;
  // Пересобираем из DOM, чтобы несохранённые правки не потерялись при удалении строки.
  const products = collectProducts();
  products.splice(Number(row.dataset.index), 1);
  catalog.products = products.map((product) => ({ ...product, category: product.category }));
  renderCatalog();
});
$('#sync-sheets').addEventListener('click', async () => {
  status($('#catalog-status'), 'Импортируем из Google Sheets…');
  try {
    const result = await api('/api/admin/catalog/sync', { method: 'POST' });
    await loadCatalog();
    status($('#catalog-status'), `Импортировано товаров: ${result.products}`, 'ok');
  } catch (error) {
    status($('#catalog-status'), error.message, 'error');
  }
});
$('#reload-orders').addEventListener('click', loadOrders);
$('#export-orders').addEventListener('click', exportOrders);

if (token) enter();
