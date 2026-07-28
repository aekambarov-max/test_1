const CART_KEY = 'lim.cart.v1';
const PROFILE_KEY = 'lim.profile.v1';

const state = {
  products: [],
  categories: [],
  settings: { currency: '₸', minOrderAmount: 0 },
  category: 'all',
  cart: loadCart(),
  sheetProduct: null,
  sheetQty: 1,
  lastOrder: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

/* ---------- утилиты ---------- */

function money(amount) {
  return `${Math.round(amount).toLocaleString('ru-RU').replace(/ /g, ' ')} ${state.settings.currency}`;
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function loadCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveCart() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
  } catch {
    /* приватный режим — работаем без сохранения */
  }
}

function cartLines() {
  return Object.entries(state.cart)
    .map(([id, qty]) => {
      const product = state.products.find((item) => item.id === id);
      return product ? { product, qty, sum: product.price * qty } : null;
    })
    .filter(Boolean);
}

const cartTotal = () => cartLines().reduce((acc, line) => acc + line.sum, 0);
const cartCount = () => cartLines().reduce((acc, line) => acc + line.qty, 0);

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 2000);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

/* ---------- навигация ---------- */

function show(view) {
  for (const name of ['catalog', 'checkout', 'success']) {
    $(`#view-${name}`).hidden = name !== view;
  }
  $('#cartbar').hidden = view !== 'catalog' || cartCount() === 0;
  window.scrollTo(0, 0);
}

/* ---------- каталог ---------- */

async function loadCatalog() {
  const response = await fetch('/api/catalog');
  if (!response.ok) throw new Error('Каталог недоступен');
  const data = await response.json();
  state.products = data.products;
  state.categories = data.categories;
  state.settings = data.settings;

  // Убираем из корзины товары, исчезнувшие из каталога или закончившиеся.
  let changed = false;
  for (const id of Object.keys(state.cart)) {
    const product = state.products.find((item) => item.id === id);
    if (!product || !product.inStock) {
      delete state.cart[id];
      changed = true;
    }
  }
  if (changed) saveCart();

  renderCategories();
  renderProducts();
  renderCart();
  if (data.updatedAt) {
    $('#catalog-meta').textContent = `Каталог обновлён ${new Date(data.updatedAt).toLocaleString('ru-RU', {
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    })}`;
  }
}

function renderCategories() {
  const all = [{ id: 'all', title: 'Всё' }, ...state.categories];
  $('#categories').innerHTML = all
    .map(
      (category) =>
        `<button class="chip" type="button" data-category="${category.id}" aria-pressed="${
          state.category === category.id
        }">${escapeHtml(category.title)}</button>`,
    )
    .join('');
}

function renderProducts() {
  const list =
    state.category === 'all'
      ? state.products
      : state.products.filter((product) => product.category === state.category);

  $('#products').innerHTML = list.length
    ? list
        .map(
          (product) => `
      <article class="card ${product.inStock ? '' : 'card--out'}" data-id="${product.id}" role="button" tabindex="0">
        <img class="card__img" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.title)}" loading="lazy" />
        <div class="card__body">
          ${product.inStock ? '' : '<span class="tag tag--out">Нет в наличии</span>'}
          <div class="card__title">${escapeHtml(product.title)}</div>
          <div class="card__farmer">${escapeHtml(product.farmer)}</div>
          <div class="card__foot">
            <div class="card__price">${money(product.price)}<span class="card__unit"> / ${escapeHtml(product.unit)}</span></div>
            <button class="add" type="button" data-add="${product.id}" ${product.inStock ? '' : 'disabled'}
              aria-label="Добавить ${escapeHtml(product.title)} в корзину">+</button>
          </div>
        </div>
      </article>`,
        )
        .join('')
    : '<p class="empty">В этой категории пока пусто</p>';
}

/* ---------- карточка товара ---------- */

function openProduct(id) {
  const product = state.products.find((item) => item.id === id);
  if (!product) return;
  state.sheetProduct = product;
  state.sheetQty = state.cart[id] || 1;

  $('#ps-img').src = product.image;
  $('#ps-img').alt = product.title;
  $('#ps-title').textContent = product.title;
  $('#ps-price').textContent = `${money(product.price)} / ${product.unit}`;
  $('#ps-desc').textContent = product.description;
  $('#ps-stock').textContent = product.inStock ? 'В наличии' : 'Нет в наличии';
  $('#ps-stock').className = product.inStock ? 'tag' : 'tag tag--out';
  $('#ps-farmer').textContent = product.farmer;
  $('#ps-story').textContent = product.story;
  $('#ps-farmer-box').hidden = !product.farmer && !product.story;
  $('#ps-qty-value').textContent = state.sheetQty;
  $('#ps-add').disabled = !product.inStock;
  $('#ps-add').textContent = product.inStock ? 'В корзину' : 'Нет в наличии';
  $('#product-sheet').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeSheets() {
  $('#product-sheet').hidden = true;
  $('#cart-sheet').hidden = true;
  document.body.style.overflow = '';
}

/* ---------- корзина ---------- */

function setQty(id, qty) {
  if (qty <= 0) delete state.cart[id];
  else state.cart[id] = Math.min(99, qty);
  saveCart();
  renderCart();
}

function renderCart() {
  const lines = cartLines();
  const count = cartCount();
  const total = cartTotal();

  $('#cart-badge').hidden = count === 0;
  $('#cart-badge').textContent = count;
  $('#cartbar').hidden = count === 0 || $('#view-catalog').hidden;
  $('#cartbar-count').textContent = `${count} ${plural(count, 'товар', 'товара', 'товаров')}`;
  $('#cartbar-total').textContent = money(total);
  $('#cart-total').textContent = money(total);

  $('#cart-items').innerHTML = lines.length
    ? lines
        .map(
          ({ product, qty, sum }) => `
      <div class="cart-item">
        <div>
          <div class="cart-item__title">${escapeHtml(product.title)}</div>
          <div class="cart-item__meta">${money(product.price)} / ${escapeHtml(product.unit)}</div>
          <div class="qty" data-cart-qty="${product.id}" style="margin-top:8px">
            <button type="button" data-step="-1" aria-label="Меньше">−</button>
            <span>${qty}</span>
            <button type="button" data-step="1" aria-label="Больше">+</button>
          </div>
        </div>
        <div class="cart-item__side">
          <span class="cart-item__sum">${money(sum)}</span>
          <button class="link-danger" type="button" data-remove="${product.id}">Удалить</button>
        </div>
      </div>`,
        )
        .join('')
    : '<p class="empty">Корзина пуста</p>';

  const min = state.settings.minOrderAmount;
  const belowMin = min > 0 && total < min && lines.length > 0;
  $('#min-order').hidden = !belowMin;
  if (belowMin) $('#min-order').textContent = `Минимальная сумма заказа — ${money(min)}. Добавьте ещё на ${money(min - total)}.`;
  $('#to-checkout').disabled = lines.length === 0 || belowMin;

  renderSummary();
}

function renderSummary() {
  const lines = cartLines();
  $('#checkout-summary').innerHTML =
    lines
      .map(
        ({ product, qty, sum }) =>
          `<div class="summary__row"><span>${escapeHtml(product.title)} × ${qty}</span><span>${money(sum)}</span></div>`,
      )
      .join('') + `<div class="summary__total"><span>Итого</span><span>${money(cartTotal())}</span></div>`;
}

/* ---------- чек-аут ---------- */

function fillProfile() {
  try {
    const profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
    for (const key of ['name', 'phone', 'address']) {
      if (profile[key]) $(`#checkout-form [name="${key}"]`).value = profile[key];
    }
  } catch {
    /* нет сохранённого профиля */
  }
}

function saveProfile(customer) {
  try {
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({ name: customer.name, phone: customer.phone, address: customer.address }),
    );
  } catch {
    /* приватный режим */
  }
}

function clearFieldErrors() {
  $$('#checkout-form .field').forEach((field) => field.classList.remove('field--invalid'));
  $$('#checkout-form .field__error').forEach((el) => (el.textContent = ''));
  $('#checkout-error').hidden = true;
}

function showFieldErrors(fields) {
  for (const [name, message] of Object.entries(fields || {})) {
    const el = $(`#checkout-form [data-error="${name}"]`);
    if (el) {
      el.textContent = message;
      el.closest('.field').classList.add('field--invalid');
    } else {
      $('#checkout-error').textContent = message;
      $('#checkout-error').hidden = false;
    }
  }
}

function validateLocally(customer) {
  const errors = {};
  if (customer.name.trim().length < 2) errors.name = 'Укажите имя';
  const digits = customer.phone.replace(/\D/g, '');
  const normalized = digits.length === 11 ? `7${digits.slice(1)}` : digits.length === 10 ? `7${digits}` : digits;
  if (!/^77\d{9}$/.test(normalized)) errors.phone = 'Телефон в формате +7 7XX XXX XX XX';
  if (customer.address.trim().length < 5) errors.address = 'Укажите адрес доставки';
  if (!customer.deliveryTime) errors.deliveryTime = 'Выберите желаемое время доставки';
  return errors;
}

async function submitOrder(event) {
  event.preventDefault();
  clearFieldErrors();

  const form = new FormData($('#checkout-form'));
  const customer = {
    name: String(form.get('name') || ''),
    phone: String(form.get('phone') || ''),
    address: String(form.get('address') || ''),
    deliveryTime: String(form.get('deliveryTime') || ''),
    paymentMethod: String(form.get('paymentMethod') || 'cash'),
    comment: String(form.get('comment') || ''),
  };

  const localErrors = validateLocally(customer);
  if (Object.keys(localErrors).length > 0) {
    showFieldErrors(localErrors);
    $('#checkout-form .field--invalid input, #checkout-form .field--invalid select')?.focus();
    return;
  }

  const button = $('#submit-order');
  button.disabled = true;
  button.textContent = 'Отправляем…';

  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        customer,
        items: cartLines().map(({ product, qty }) => ({ id: product.id, qty })),
        meta: { source: new URLSearchParams(location.search).get('utm_source') || 'web' },
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      showFieldErrors(data.fields || { form: data.error || 'Не удалось отправить заказ' });
      return;
    }

    saveProfile(customer);
    state.lastOrder = data;
    state.cart = {};
    saveCart();
    renderCart();

    $('#order-number').textContent = `№${data.number}`;
    $('#wa-link').href = data.whatsappUrl;
    $('#wa-text').textContent = data.whatsappText;
    show('success');
  } catch {
    $('#checkout-error').textContent = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
    $('#checkout-error').hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = 'Отправить заказ';
  }
}

/* ---------- события ---------- */

function bind() {
  $('#categories').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-category]');
    if (!chip) return;
    state.category = chip.dataset.category;
    renderCategories();
    renderProducts();
  });

  $('#products').addEventListener('click', (event) => {
    const addButton = event.target.closest('[data-add]');
    if (addButton) {
      event.stopPropagation();
      const id = addButton.dataset.add;
      setQty(id, (state.cart[id] || 0) + 1);
      toast('Добавлено в корзину');
      return;
    }
    const card = event.target.closest('.card');
    if (card) openProduct(card.dataset.id);
  });

  $('#products').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('.card');
    if (card) {
      event.preventDefault();
      openProduct(card.dataset.id);
    }
  });

  $('#ps-qty').addEventListener('click', (event) => {
    const step = Number(event.target.dataset.step);
    if (!step) return;
    state.sheetQty = Math.min(99, Math.max(1, state.sheetQty + step));
    $('#ps-qty-value').textContent = state.sheetQty;
  });

  $('#ps-add').addEventListener('click', () => {
    if (!state.sheetProduct) return;
    setQty(state.sheetProduct.id, state.sheetQty);
    closeSheets();
    toast('Добавлено в корзину');
  });

  $('#cart-items').addEventListener('click', (event) => {
    const removeButton = event.target.closest('[data-remove]');
    if (removeButton) return setQty(removeButton.dataset.remove, 0);
    const step = Number(event.target.dataset.step);
    const holder = event.target.closest('[data-cart-qty]');
    if (step && holder) {
      const id = holder.dataset.cartQty;
      setQty(id, (state.cart[id] || 0) + step);
    }
  });

  const openCart = () => {
    if (cartCount() === 0) return toast('Корзина пуста');
    $('#cart-sheet').hidden = false;
    document.body.style.overflow = 'hidden';
  };
  $('#cart-open').addEventListener('click', openCart);
  $('#cartbar-btn').addEventListener('click', openCart);

  $$('[data-close]').forEach((el) => el.addEventListener('click', closeSheets));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSheets();
  });

  $('#to-checkout').addEventListener('click', () => {
    closeSheets();
    renderSummary();
    fillProfile();
    show('checkout');
  });

  $$('[data-nav="catalog"]').forEach((el) =>
    el.addEventListener('click', () => {
      show('catalog');
      renderCart();
    }),
  );

  $('#checkout-form').addEventListener('submit', submitOrder);

  // Отмечаем, что клиент действительно ушёл в WhatsApp — это метрика drop-off из PRD.
  $('#wa-link').addEventListener('click', () => {
    if (!state.lastOrder) return;
    navigator.sendBeacon?.(`/api/orders/${state.lastOrder.number}/whatsapp-opened`, new Blob([], { type: 'application/json' }));
  });

  $('#copy-text').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#wa-text').textContent);
      toast('Текст заказа скопирован');
    } catch {
      toast('Скопируйте текст вручную');
    }
  });
}

bind();
loadCatalog().catch(() => {
  $('#products').innerHTML = '<p class="empty">Не удалось загрузить каталог. Обновите страницу.</p>';
});
