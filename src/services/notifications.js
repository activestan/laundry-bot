/**
 * notifications.js – Send notifications to admins, workers, and customers.
 *
 * ROLES:
 *   Admin  — Full access: view all orders, customers, stats, track, update status
 *   Worker — Limited: track orders and update order status only
 *
 * All Telegram messages use HTML parse mode for reliability.
 */
const { buildWorkerNotification, buildMarkdownReceipt, generatePDFReceipt } = require('./receipt');

/**
 * Get a reference to the Telegraf bot instance.
 * We set this at boot time to avoid circular deps.
 */
let botInstance = null;

function setBotInstance(bot) {
  botInstance = bot;
}

/**
 * Parse admin/worker chat IDs from comma-separated env vars.
 */
function getAdminChatIds() {
  return (process.env.ADMIN_CHAT_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .map(Number);
}

function getWorkerChatIds() {
  return (process.env.WORKER_CHAT_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .map(Number);
}

function isAdmin(telegramId) {
  return getAdminChatIds().includes(Number(telegramId));
}

function isWorker(telegramId) {
  return getWorkerChatIds().includes(Number(telegramId));
}

function isStaff(telegramId) {
  return isAdmin(telegramId) || isWorker(telegramId);
}

/**
 * Send the worker/admin notification after a successful payment.
 */
async function notifyStaff({ order, user, deliveryDetail }) {
  if (!botInstance) {
    console.warn('[Notifications] Bot instance not set – cannot notify staff.');
    return;
  }

  const message = buildWorkerNotification({ order, user, deliveryDetail });
  const targets = [...new Set([...getAdminChatIds(), ...getWorkerChatIds()])];

  for (const chatId of targets) {
    try {
      await botInstance.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' });
    } catch (err) {
      console.error(`[Notifications] Failed to notify ${chatId}:`, err.message);
    }
  }
}

/**
 * Send receipt + PDF to customer.
 */
async function sendCustomerReceipt({ order, user, deliveryDetail }) {
  if (!botInstance) return;

  const businessName = process.env.BUSINESS_NAME || 'FreshPress Laundry';
  const whatsapp = process.env.BUSINESS_WHATSAPP || '+234XXXXXXXXXX';

  // HTML receipt
  const receiptText = buildMarkdownReceipt({ order, user, deliveryDetail });
  try {
    await botInstance.telegram.sendMessage(user.telegram_id, receiptText, {
      parse_mode: 'HTML',
    });
  } catch (err) {
    console.error('[Notifications] sendCustomerReceipt text failed:', err.message);
  }

  // PDF receipt
  try {
    const pdfBuffer = await generatePDFReceipt({ order, user, deliveryDetail });
    await botInstance.telegram.sendDocument(user.telegram_id, {
      source: pdfBuffer,
      filename: `Receipt_${order.order_number}.pdf`,
    });
  } catch (err) {
    console.error('[Notifications] sendCustomerReceipt PDF failed:', err.message);
  }

  // Confirmation message
  const confirmation =
    `✅ <b>Thank you for booking with ${businessName}!</b>\n\n` +
    `Your laundry request has been confirmed successfully.\n\n` +
    `🔢 <b>Your Order Number is:</b> <code>${order.order_number}</code>\n\n` +
    `Please keep this order number safe for tracking and support.\n\n` +
    `For updates regarding your laundry status, kindly chat us on WhatsApp:\n` +
    `📱 ${whatsapp}`;

  try {
    await botInstance.telegram.sendMessage(user.telegram_id, confirmation, {
      parse_mode: 'HTML',
    });
  } catch (err) {
    console.error('[Notifications] sendCustomerReceipt confirmation failed:', err.message);
  }
}

/**
 * Notify customer about order status change.
 */
async function notifyStatusChange(telegramId, orderNumber, oldStatus, newStatus) {
  if (!botInstance) return;

  const statusEmoji = {
    pending: '🟡',
    washing: '🔵',
    drying: '🟠',
    ready: '🟢',
    delivered: '✅',
    cancelled: '🔴',
  };

  let statusMsg = `Your order is now being processed (${newStatus}).`;
  if (newStatus === 'ready') {
    statusMsg = '🎉 Your laundry is ready! Please arrange pickup or await delivery.';
  } else if (newStatus === 'delivered') {
    statusMsg = '🎉 Your laundry has been delivered. Thank you!';
  }

  const message =
    `📢 <b>Order Status Update</b>\n\n` +
    `🔢 Order: <code>${orderNumber}</code>\n` +
    `${statusEmoji[oldStatus] || '⚪'} ${oldStatus.toUpperCase()}  →  ${statusEmoji[newStatus] || '⚪'} ${newStatus.toUpperCase()}\n\n` +
    statusMsg;

  try {
    await botInstance.telegram.sendMessage(telegramId, message, { parse_mode: 'HTML' });
  } catch (err) {
    console.error('[Notifications] notifyStatusChange failed:', err.message);
  }
}

/**
 * Send daily sales summary to admins only.
 */
async function sendDailySummary(stats) {
  if (!botInstance) return;

  const { formatNaira } = require('../utils/helpers');
  const message =
    `📊 <b>Daily Sales Summary</b>\n` +
    `📅 ${new Date().toLocaleDateString('en-NG', { dateStyle: 'full', timeZone: 'Africa/Lagos' })}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `📦 Total Orders Today: <b>${stats.orderCount}</b>\n` +
    `💰 Total Revenue: <b>${formatNaira(stats.totalRevenue)}</b>\n` +
    `✅ Paid Orders: <b>${stats.paidCount}</b>\n` +
    `🟡 Pending Orders: <b>${stats.pendingCount}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━`;

  for (const chatId of getAdminChatIds()) {
    try {
      await botInstance.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' });
    } catch (err) {
      console.error(`[Notifications] Daily summary to ${chatId} failed:`, err.message);
    }
  }
}

module.exports = {
  setBotInstance,
  getAdminChatIds,
  getWorkerChatIds,
  isAdmin,
  isWorker,
  isStaff,
  notifyStaff,
  sendCustomerReceipt,
  notifyStatusChange,
  sendDailySummary,
};
