// Нормализация казахстанского номера к формату 77XXXXXXXXX (11 цифр).
export function normalizePhone(input) {
  const digits = String(input ?? '').replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('8') || digits.startsWith('7'))) {
    return `7${digits.slice(1)}`;
  }
  if (digits.length === 10 && digits.startsWith('7')) return `7${digits}`;
  return digits;
}

export function isValidPhone(input) {
  const phone = normalizePhone(input);
  return /^77\d{9}$/.test(phone);
}

const MAX = { name: 80, address: 300, comment: 500, deliveryTime: 60 };

function trimField(value, limit) {
  return String(value ?? '').trim().slice(0, limit);
}

/**
 * Проверяет заказ и собирает его позиции по актуальным ценам каталога:
 * клиент присылает только id и количество, суммы считаются на сервере.
 */
export function validateOrder(payload, { products, minOrderAmount = 0 }) {
  const errors = {};
  const customer = {
    name: trimField(payload?.customer?.name, MAX.name),
    phone: normalizePhone(payload?.customer?.phone),
    address: trimField(payload?.customer?.address, MAX.address),
    comment: trimField(payload?.customer?.comment, MAX.comment),
    deliveryTime: trimField(payload?.customer?.deliveryTime, MAX.deliveryTime),
    paymentMethod: payload?.customer?.paymentMethod === 'transfer' ? 'transfer' : 'cash',
  };

  if (customer.name.length < 2) errors.name = 'Укажите имя';
  if (!isValidPhone(payload?.customer?.phone)) errors.phone = 'Телефон в формате +7 7XX XXX XX XX';
  if (customer.address.length < 5) errors.address = 'Укажите адрес доставки';
  if (!customer.deliveryTime) errors.deliveryTime = 'Выберите желаемое время доставки';

  const byId = new Map(products.map((product) => [product.id, product]));
  const items = [];
  const rawItems = Array.isArray(payload?.items) ? payload.items : [];

  for (const rawItem of rawItems) {
    const product = byId.get(String(rawItem?.id));
    if (!product) {
      errors.items = 'Некоторых товаров больше нет в каталоге — обновите корзину';
      continue;
    }
    if (!product.inStock) {
      errors.items = `«${product.title}» закончился — удалите его из корзины`;
      continue;
    }
    const qty = Math.floor(Number(rawItem?.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > 99) {
      errors.items = 'Количество должно быть от 1 до 99';
      continue;
    }
    items.push({
      id: product.id,
      title: product.title,
      unit: product.unit,
      price: product.price,
      qty,
      sum: product.price * qty,
    });
  }

  if (items.length === 0 && !errors.items) errors.items = 'Корзина пуста';

  const total = items.reduce((acc, item) => acc + item.sum, 0);
  if (!errors.items && minOrderAmount > 0 && total < minOrderAmount) {
    errors.total = `Минимальная сумма заказа — ${minOrderAmount}`;
  }

  return { valid: Object.keys(errors).length === 0, errors, customer, items, total };
}
