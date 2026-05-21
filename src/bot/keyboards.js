/**
 * keyboards.js – Telegram inline & reply keyboard builders.
 */
const { Markup } = require('telegraf');
const { SERVICES } = require('../utils/constants');
const { formatNaira } = require('../utils/helpers');

/**
 * Main menu reply keyboard.
 */
function mainMenuKeyboard() {
  return Markup.keyboard([
    ['🧺 New Order', '📋 My Orders'],
    ['📜 Order History', '📦 Track Order'],
    ['💳 My Account', 'ℹ️ Help'],
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
 * @param {number} currentPage – current page (1-indexed)
 * @param {number} totalPages
 * @param {number} months – the selected time range (0 = all time)
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
 * Service selection inline keyboard.
 * Each button shows the item name + price.
 * `selectedItems` is a Set of item IDs already in the cart.
 */
function serviceMenuKeyboard(selectedItems = new Set()) {
  const buttons = SERVICES.map((svc) => {
    const check = selectedItems.has(svc.id) ? ' ✅' : '';
    return [
      Markup.button.callback(
        `${svc.emoji} ${svc.name} — ${formatNaira(svc.price)}${check}`,
        `select_item_${svc.id}`
      ),
    ];
  });

  // Add Done button at bottom
  if (selectedItems.size > 0) {
    buttons.push([Markup.button.callback('✅ Done — Proceed', 'done_selecting')]);
  }

  buttons.push([Markup.button.callback('❌ Cancel Order', 'cancel_order')]);

  return Markup.inlineKeyboard(buttons);
}

/**
 * Delivery option inline keyboard.
 */
function deliveryKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🚚 Pickup Delivery (₦3,000)', 'delivery_pickup')],
    [Markup.button.callback('🏃 Self Delivery (Free)', 'delivery_self')],
  ]);
}

/**
 * Confirm order inline keyboard.
 */
function confirmOrderKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Confirm & Pay', 'confirm_pay')],
    [Markup.button.callback('❌ Cancel Order', 'cancel_order')],
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
  confirmOrderKeyboard,
  orderStatusKeyboard,
};
