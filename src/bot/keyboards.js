/**
 * keyboards.js – Telegram inline & reply keyboard builders.
 * Uses dynamic services from the catalogue.
 */
const { Markup } = require('telegraf');
const { formatDisplayPrice } = require('../services/catalogue');

/**
 * Main menu reply keyboard.
 */
function mainMenuKeyboard() {
  return Markup.keyboard([
    ['🧺 New Order', '📋 My Orders'],
    ['📜 Order History', '💳 Settle Pending'],
    ['📦 Track Order', '💳 My Account'],
    ['ℹ️ Help'],
  ]).resize();
}

/**
 * Order history time-range selection keyboard.
 */
function orderHistoryKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📅 Last 1 Month', 'history_1'),
      Markup.button.callback('📅 Last 2 Months', 'history_2'),
    ],
    [
      Markup.button.callback('📅 Last 3 Months', 'history_3'),
      Markup.button.callback('📅 All Time', 'history_all'),
    ],
  ]);
}

/**
 * Pagination buttons for order history.
 */
function historyPaginationKeyboard(currentPage, totalPages, months) {
  const buttons = [];

  if (currentPage > 1) {
    buttons.push(Markup.button.callback('⬅️ Previous', `histpage_${months}_${currentPage - 1}`));
  }

  buttons.push(Markup.button.callback(`📄 ${currentPage}/${totalPages}`, 'noop'));

  if (currentPage < totalPages) {
    buttons.push(Markup.button.callback('Next ➡️', `histpage_${months}_${currentPage + 1}`));
  }

  return Markup.inlineKeyboard([buttons]);
}

/**
 * Service selection inline keyboard (DYNAMIC from DB).
 */
function serviceMenuKeyboard(services, selectedItems = new Set()) {
  const buttons = services.map((svc) => {
    const check = selectedItems.has(svc.id) ? ' ✅' : '';
    return [
      Markup.button.callback(
        `${svc.emoji} ${svc.name} — ${formatDisplayPrice(svc.price)}${check}`,
        `select_item_${svc.id}`
      ),
    ];
  });

  if (selectedItems.size > 0) {
    buttons.push([Markup.button.callback('✅ Done — Proceed', 'done_selecting')]);
  }

  buttons.push([Markup.button.callback('❌ Cancel Order', 'cancel_order')]);

  return Markup.inlineKeyboard(buttons);
}

/**
 * Delivery option inline keyboard.
 */
function deliveryKeyboard(pickupFee) {
  const feeDisplay = pickupFee ? formatDisplayPrice(pickupFee) : '₦2,999.99';
  return Markup.inlineKeyboard([
    [Markup.button.callback(`🚚 Pickup Delivery (${feeDisplay})`, 'delivery_pickup')],
    [Markup.button.callback('🏃 Self Delivery (Free)', 'delivery_self')],
  ]);
}

/**
 * Payment timing keyboard (self-delivery customers only).
 */
function paymentTimingKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('💳 Pay Now (Transfer)', 'pay_now')],
    [Markup.button.callback('🏪 Pay When Collecting', 'pay_on_collection')],
  ]);
}

/**
 * Confirm order inline keyboard.
 */
function confirmOrderKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Confirm Order', 'confirm_pay')],
    [Markup.button.callback('❌ Cancel Order', 'cancel_order')],
  ]);
}

/**
 * Collection confirmation keyboard — after payment for pay_on_collection orders.
 */
function collectionConfirmKeyboard(orderNumber) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Yes, I\'ve collected my clothes', `collected_${orderNumber}`)],
    [Markup.button.callback('⏳ Not yet, I\'ll collect later', `not_collected_${orderNumber}`)],
  ]);
}

/**
 * Admin: Order status update keyboard.
 */
function orderStatusKeyboard(orderNumber) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🔵 Washing', `status_${orderNumber}_washing`),
      Markup.button.callback('🟠 Drying', `status_${orderNumber}_drying`),
    ],
    [
      Markup.button.callback('🟢 Ready', `status_${orderNumber}_ready`),
      Markup.button.callback('✅ Delivered', `status_${orderNumber}_delivered`),
    ],
    [Markup.button.callback('🔴 Cancelled', `status_${orderNumber}_cancelled`)],
  ]);
}

module.exports = {
  mainMenuKeyboard,
  orderHistoryKeyboard,
  historyPaginationKeyboard,
  serviceMenuKeyboard,
  deliveryKeyboard,
  paymentTimingKeyboard,
  confirmOrderKeyboard,
  collectionConfirmKeyboard,
  orderStatusKeyboard,
};
