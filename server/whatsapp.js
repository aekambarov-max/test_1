const PAYMENT_LABELS = {
  cash: 'наличными при получении',
  transfer: 'переводом при получении',
};

export function formatMoney(amount, currency = '₸') {
  return `${Math.round(amount).toLocaleString('ru-RU').replace(/ /g, ' ')} ${currency}`;
}

/** Текст заказа для менеджера — им же открывается чат WhatsApp. */
export function buildOrderMessage(order, currency = '₸') {
  const lines = [
    `Заказ ${order.number} — LIM`,
    '',
    ...order.items.map(
      (item) => `• ${item.title} — ${item.qty} × ${item.unit} = ${formatMoney(item.sum, currency)}`,
    ),
    '',
    `Итого: ${formatMoney(order.total, currency)}`,
    '',
    `Имя: ${order.customer.name}`,
    `Телефон: +${order.customer.phone}`,
    `Адрес: ${order.customer.address}`,
    `Время доставки: ${order.customer.deliveryTime}`,
    `Оплата: ${PAYMENT_LABELS[order.customer.paymentMethod] || PAYMENT_LABELS.cash}`,
  ];
  if (order.customer.comment) lines.push(`Комментарий: ${order.customer.comment}`);
  return lines.join('\n');
}

export function buildWhatsAppUrl(phone, message) {
  const digits = String(phone || '').replace(/\D/g, '');
  const text = encodeURIComponent(message);
  return digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`;
}
