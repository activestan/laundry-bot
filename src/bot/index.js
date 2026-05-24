/**
 * bot/index.js – Main Telegram bot setup.
 *
 * Creates the Telegraf bot, registers all handlers, and exports the instance.
 * Uses MongoDB-backed sessions so conversations survive server restarts.
 */
const { Telegraf, session } = require('telegraf');
const { registerOnboarding, handleOnboardingMessage } = require('./onboarding');
const { registerOrdering, handleOrderingMessage } = require('./ordering');
const { registerAdmin } = require('./admin');
const {
  mainMenuKeyboard,
  orderHistoryKeyboard,
  historyPaginationKeyboard,
} = require('./keyboards');
const { User, Order, DeliveryDetail, Rating } = require('../models');
const { formatNaira, formatDate, sanitize } = require('../utils/helpers');
const { ORDER_STATUS_EMOJI } = require('../utils/constants');
const { setBotInstance, isAdmin } = require('../services/notifications');
const { createMongoStore } = require('./sessionStore');

// ─── Order history config ───────────────────────────────────
const HISTORY_PAGE_SIZE = 5;

/**
 * Build the order history message for a given page of orders.
 */
function buildHistoryMessage(orders, page, totalPages, totalOrders, rangeLabel) {
  let msg = `📜 <b>Order History — ${rangeLabel}</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📊 ${totalOrders} order${totalOrders !== 1 ? 's' : ''} found`;
  if (totalPages > 1) msg += ` • Page ${page}/${totalPages}`;
  msg += `\n\n`;

  let pageTotalSpent = 0;

  for (const o of orders) {
    const statusEmoji = ORDER_STATUS_EMOJI[o.order_status] || '⚪';
    const payEmoji = o.payment_status === 'paid' ? '💚' : '🟡';

    msg += `🔢 <code>${o.order_number}</code>\n`;
    msg += `  ${statusEmoji} ${o.order_status.toUpperCase()} | ${payEmoji} ${o.payment_status.toUpperCase()}\n`;

    const itemSummary = o.items.map((i) => `${i.quantity}x ${i.name}`).join(', ');
    msg += `  🧺 ${itemSummary}\n`;

    if (o.delivery_type === 'pickup') {
      msg += `  🚚 Pickup Delivery\n`;
    } else {
      msg += `  🏃 Self Delivery\n`;
    }

    msg += `  💰 ${formatNaira(o.total_amount)} | 📅 ${formatDate(o.created_at)}\n`;

    if (o.payment_status === 'paid') {
      pageTotalSpent += o.total_amount;
    }

    msg += `\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💰 <b>Paid on this page:</b> ${formatNaira(pageTotalSpent)}\n\n`;
  msg += `💡 <i>Use /track ORDER_NUMBER to see full details</i>`;

  return msg;
}

function getDateFrom(months) {
  if (months === 0) return null;
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function showOrderHistory(ctx, userId, months, page) {
  const dateFrom = getDateFrom(months);
  const query = { customer_id: userId };
  if (dateFrom) query.created_at = { $gte: dateFrom };

  const totalOrders = await Order.countDocuments(query);

  if (totalOrders === 0) {
    const rangeLabel = months === 0 ? 'All Time' : `Last ${months} Month${months > 1 ? 's' : ''}`;
    const text = `📜 <b>Order History — ${rangeLabel}</b>\n\n📭 No orders found in this period.\n\nTap 🧺 <b>New Order</b> to place your first!`;

    if (ctx.callbackQuery) {
      try { await ctx.editMessageText(text, { parse_mode: 'HTML' }); }
      catch { await ctx.reply(text, { parse_mode: 'HTML' }); }
    } else {
      await ctx.reply(text, { parse_mode: 'HTML' });
    }
    return;
  }

  const totalPages = Math.ceil(totalOrders / HISTORY_PAGE_SIZE);
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const skip = (safePage - 1) * HISTORY_PAGE_SIZE;

  const orders = await Order.find(query)
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(HISTORY_PAGE_SIZE);

  const rangeLabel = months === 0 ? 'All Time' : `Last ${months} Month${months > 1 ? 's' : ''}`;
  const msg = buildHistoryMessage(orders, safePage, totalPages, totalOrders, rangeLabel);
  const pagination = totalPages > 1 ? historyPaginationKeyboard(safePage, totalPages, months) : undefined;

  if (ctx.callbackQuery) {
    try { await ctx.editMessageText(msg, { parse_mode: 'HTML', ...pagination }); }
    catch { await ctx.reply(msg, { parse_mode: 'HTML', ...pagination }); }
  } else {
    await ctx.reply(msg, { parse_mode: 'HTML', ...pagination });
  }
}

/**
 * Create and configure the bot.
 */
function createBot() {
  const bot = new Telegraf(process.env.BOT_TOKEN);

  // ─── Session middleware (MongoDB-backed for persistence) ────
  bot.use(
    session({
      store: createMongoStore(),
      defaultSession: () => ({}),
    })
  );

  bot.use((ctx, next) => {
    ctx.session = ctx.session || {};
    return next();
  });

  // ─── Register handler modules ────────────────────────────────
  registerOnboarding(bot);
  registerOrdering(bot);
  registerAdmin(bot);

  // ─── Rating callback: customer taps a star ───────────────────
  bot.action(/^rate_(.+)_(\d)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();

      const orderNumber = ctx.match[1];
      const stars = parseInt(ctx.match[2], 10);
      const telegramId = ctx.from.id;

      const user = await User.findOne({ telegram_id: telegramId });
      if (!user) return;

      const order = await Order.findOne({ order_number: orderNumber, customer_id: user._id });
      if (!order) return;

      // Check if already rated
      const existing = await Rating.findOne({ order_id: order._id });
      if (existing) {
        await ctx.editMessageText(
          `⭐ You already rated this order: ${'⭐'.repeat(existing.stars)}\n\nThank you!`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      // Save rating
      await Rating.create({
        order_id: order._id,
        order_number: orderNumber,
        customer_id: user._id,
        telegram_id: telegramId,
        stars: stars,
      });

      // Ask for optional feedback
      ctx.session = ctx.session || {};
      ctx.session.step = 'awaiting_feedback';
      ctx.session.ratingOrderNumber = orderNumber;

      const starsDisplay = '⭐'.repeat(stars);

      await ctx.editMessageText(
        `${starsDisplay}\n\n` +
          `Thank you for rating <code>${orderNumber}</code>!\n\n` +
          `💬 <b>Would you like to leave a comment?</b>\n` +
          `Type your feedback below, or send /skip to skip.`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[Bot] Rating callback error:', err);
    }
  });

  // ─── /skip → Skip feedback ──────────────────────────────────
  bot.command('skip', async (ctx) => {
    if (ctx.session && ctx.session.step === 'awaiting_feedback') {
      delete ctx.session.step;
      delete ctx.session.ratingOrderNumber;
      await ctx.reply('👍 No problem! Thank you for your rating.', mainMenuKeyboard());
    }
  });

  // ─── /ratings → View ratings summary (ADMIN ONLY) ──────────
  bot.command('ratings', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('🚫 This command is for admins only.');
    }

    try {
      const totalRatings = await Rating.countDocuments();

      if (totalRatings === 0) {
        return ctx.reply('📭 No ratings yet.');
      }

      // Average rating
      const avgAgg = await Rating.aggregate([
        { $group: { _id: null, avg: { $avg: '$stars' }, count: { $sum: 1 } } },
      ]);
      const avgRating = avgAgg[0].avg.toFixed(1);

      // Star breakdown
      const breakdown = await Rating.aggregate([
        { $group: { _id: '$stars', count: { $sum: 1 } } },
        { $sort: { _id: -1 } },
      ]);

      let breakdownText = '';
      for (let i = 5; i >= 1; i--) {
        const found = breakdown.find((b) => b._id === i);
        const count = found ? found.count : 0;
        const bar = '█'.repeat(Math.round((count / totalRatings) * 20));
        breakdownText += `  ${'⭐'.repeat(i)} ${bar} ${count}\n`;
      }

      // Recent reviews with feedback
      const recentWithFeedback = await Rating.find({ feedback: { $ne: null } })
        .sort({ created_at: -1 })
        .limit(5)
        .populate('customer_id', 'first_name last_name');

      let recentText = '';
      if (recentWithFeedback.length > 0) {
        recentText = '\n💬 <b>Recent Feedback:</b>\n\n';
        for (const r of recentWithFeedback) {
          const name = r.customer_id
            ? `${r.customer_id.first_name} ${r.customer_id.last_name}`
            : 'Customer';
          recentText +=
            `  ${'⭐'.repeat(r.stars)} — ${name}\n` +
            `  <i>"${r.feedback}"</i>\n` +
            `  📅 ${formatDate(r.created_at)}\n\n`;
        }
      }

      const msg =
        `⭐ <b>Customer Ratings</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📊 <b>Average:</b> ${avgRating} ⭐ (${totalRatings} ratings)\n\n` +
        `<b>Breakdown:</b>\n` +
        breakdownText +
        recentText;

      await ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[Bot] /ratings error:', err);
      await ctx.reply('❌ Error fetching ratings.');
    }
  });

  // ─── "My Orders" button ──────────────────────────────────────
  bot.hears('📋 My Orders', async (ctx) => {
    try {
      const user = await User.findOne({ telegram_id: ctx.from.id });
      if (!user) return ctx.reply('⚠️ Please register first with /start');

      const orders = await Order.find({ customer_id: user._id })
        .sort({ created_at: -1 })
        .limit(10);

      if (!orders.length) {
        return ctx.reply(
          '📭 You have no orders yet.\n\nTap 🧺 <b>New Order</b> to get started!',
          { parse_mode: 'HTML' }
        );
      }

      let msg = '📋 <b>Your Recent Orders:</b>\n\n';
      for (const o of orders) {
        const statusEmoji = ORDER_STATUS_EMOJI[o.order_status] || '⚪';
        const payEmoji = o.payment_status === 'paid' ? '💚' : '🟡';
        msg +=
          `<code>${o.order_number}</code>\n` +
          `  ${statusEmoji} ${o.order_status.toUpperCase()} | ${payEmoji} ${o.payment_status.toUpperCase()}\n` +
          `  💰 ${formatNaira(o.total_amount)} | 📅 ${formatDate(o.created_at)}\n\n`;
      }

      msg += '💡 <i>Use /track ORDER_NUMBER for details</i>\n';
      msg += '💡 <i>Tap 📜 Order History for older orders</i>';

      await ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[Bot] My Orders error:', err);
      await ctx.reply('❌ Error fetching your orders.');
    }
  });

  // ─── "Order History" button ──────────────────────────────────
  bot.hears('📜 Order History', async (ctx) => {
    try {
      const user = await User.findOne({ telegram_id: ctx.from.id });
      if (!user) return ctx.reply('⚠️ Please register first with /start');

      await ctx.reply(
        '📜 <b>Order History</b>\n\n' +
          'How far back would you like to see?\n' +
          'Choose a time range:',
        {
          parse_mode: 'HTML',
          ...orderHistoryKeyboard(),
        }
      );
    } catch (err) {
      console.error('[Bot] Order History error:', err);
      await ctx.reply('❌ Error loading order history.');
    }
  });

  // ─── History callbacks ───────────────────────────────────────
  bot.action(/^history_(\d+|all)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const user = await User.findOne({ telegram_id: ctx.from.id });
      if (!user) { await ctx.editMessageText('⚠️ Please register first with /start'); return; }
      const param = ctx.match[1];
      const months = param === 'all' ? 0 : parseInt(param, 10);
      await showOrderHistory(ctx, user._id, months, 1);
    } catch (err) {
      console.error('[Bot] history callback error:', err);
      await ctx.reply('❌ Error loading order history.');
    }
  });

  bot.action(/^histpage_(\d+)_(\d+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();
      const user = await User.findOne({ telegram_id: ctx.from.id });
      if (!user) return;
      const months = parseInt(ctx.match[1], 10);
      const page = parseInt(ctx.match[2], 10);
      await showOrderHistory(ctx, user._id, months, page);
    } catch (err) {
      console.error('[Bot] history pagination error:', err);
    }
  });

  bot.action('noop', async (ctx) => { await ctx.answerCbQuery(); });

  // ─── "My Account" button ─────────────────────────────────────
  bot.hears('💳 My Account', async (ctx) => {
    try {
      const user = await User.findOne({ telegram_id: ctx.from.id });
      if (!user) return ctx.reply('⚠️ Please register first with /start');

      let msg =
        `💳 <b>Your Account Details</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `👤 <b>Name:</b> ${user.first_name} ${user.last_name}\n` +
        `📧 <b>Email:</b> ${user.email}\n`;

      if (user.telegram_username) {
        msg += `💬 <b>Telegram:</b> @${user.telegram_username}\n`;
      }

      msg += `📅 <b>Joined:</b> ${formatDate(user.created_at)}\n\n`;

      if (user.virtual_account && user.virtual_account.account_number) {
        msg +=
          `🏦 <b>Payment Account:</b>\n` +
          `  Bank: ${user.virtual_account.bank_name}\n` +
          `  Account: <code>${user.virtual_account.account_number}</code>\n\n` +
          `📌 Use this account for all laundry payments.`;
      } else {
        msg += '⚠️ Payment account not yet created. Contact support.';
      }

      await ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[Bot] My Account error:', err);
      await ctx.reply('❌ Error fetching account details.');
    }
  });

  // ─── "Track Order" button ────────────────────────────────────
  bot.hears('📦 Track Order', async (ctx) => {
    try {
      ctx.session = ctx.session || {};
      ctx.session.step = 'awaiting_track_number';
      await ctx.reply(
        '🔍 <b>Track Your Order</b>\n\nPlease enter your order number:\n<i>(e.g. LDRY-2025-0001)</i>',
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[Bot] Track Order error:', err);
      await ctx.reply('❌ Something went wrong. Please try again.');
    }
  });

  // ─── "Help" button ───────────────────────────────────────────
  bot.hears('ℹ️ Help', async (ctx) => {
    try {
      const businessName = process.env.BUSINESS_NAME || 'Praisel Laundromat';
      const whatsapp = process.env.BUSINESS_WHATSAPP || '+234XXXXXXXXXX';

      const msg =
        `ℹ️ <b>${businessName} — Help</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📌 <b>How to use this bot:</b>\n\n` +
        `1️⃣ Tap <b>🧺 New Order</b> to start a laundry order\n` +
        `2️⃣ Select your items and quantities\n` +
        `3️⃣ Choose delivery option\n` +
        `4️⃣ Review your order summary\n` +
        `5️⃣ Pay via bank transfer to your dedicated account\n` +
        `6️⃣ Receive your receipt automatically!\n\n` +
        `📋 <b>Commands:</b>\n` +
        `  /start — Register or restart\n` +
        `  /track ORDER_NUMBER — Track an order\n\n` +
        `📜 <b>Order History:</b>\n` +
        `  Tap <b>📜 Order History</b> to view past orders\n` +
        `  (up to 3 months back or all time)\n\n` +
        `📞 <b>Support:</b>\n` +
        `  WhatsApp: ${whatsapp}\n\n` +
        `<i>We typically process orders within 24-48 hours.</i>`;

      await ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[Bot] Help error:', err);
      await ctx.reply(
        'ℹ️ Need help? Contact us on WhatsApp: ' +
          (process.env.BUSINESS_WHATSAPP || '+234XXXXXXXXXX')
      );
    }
  });

  // ─── General text handler ────────────────────────────────────
  bot.on('text', async (ctx) => {
    try {
      // Check if awaiting rating feedback
      if (ctx.session && ctx.session.step === 'awaiting_feedback') {
        const feedback = sanitize(ctx.message.text);
        const orderNumber = ctx.session.ratingOrderNumber;

        delete ctx.session.step;
        delete ctx.session.ratingOrderNumber;

        if (orderNumber && feedback) {
          await Rating.findOneAndUpdate(
            { order_number: orderNumber, telegram_id: ctx.from.id },
            { feedback: feedback }
          );
        }

        await ctx.reply(
          '💬 Thank you for your feedback! We appreciate it. 🙏',
          mainMenuKeyboard()
        );
        return;
      }

      // Check if in onboarding
      const handledOnboarding = await handleOnboardingMessage(ctx);
      if (handledOnboarding) return;

      // Check if in ordering flow
      const handledOrdering = await handleOrderingMessage(ctx);
      if (handledOrdering) return;

      // Check if tracking
      if (ctx.session && ctx.session.step === 'awaiting_track_number') {
        const orderNumber = ctx.message.text.trim().toUpperCase();
        delete ctx.session.step;

        const user = await User.findOne({ telegram_id: ctx.from.id });

        const query = { order_number: orderNumber };
        if (user && !isAdmin(ctx.from.id)) {
          query.customer_id = user._id;
        }

        const order = await Order.findOne(query).populate(
          'customer_id',
          'first_name last_name email telegram_username'
        );

        if (!order) {
          return ctx.reply(
            `❌ Order <code>${orderNumber}</code> not found.\n\n<i>Make sure the order number is correct.</i>`,
            { parse_mode: 'HTML' }
          );
        }

        const statusEmoji = ORDER_STATUS_EMOJI[order.order_status] || '⚪';
        const paymentEmoji = order.payment_status === 'paid' ? '💚' : '🟡';

        let msg =
          `📦 <b>Order Status</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🔢 Order: <code>${order.order_number}</code>\n` +
          `${statusEmoji} Status: <b>${order.order_status.toUpperCase()}</b>\n` +
          `${paymentEmoji} Payment: <b>${order.payment_status.toUpperCase()}</b>\n` +
          `💰 Total: ${formatNaira(order.total_amount)}\n` +
          `📅 Created: ${formatDate(order.created_at)}`;

        if (order.delivery_type === 'pickup') {
          const del = await DeliveryDetail.findOne({ order_id: order._id });
          if (del) {
            msg += `\n\n📍 <b>Pickup:</b> ${del.lodge_name}, ${del.lodge_address}`;
          }
        }

        return ctx.reply(msg, { parse_mode: 'HTML' });
      }

      // Unknown message
      await ctx.reply(
        '🤔 I didn\'t understand that.\n\nUse the menu below or type /start to begin.',
        mainMenuKeyboard()
      );
    } catch (err) {
      console.error('[Bot] text handler error:', err);
      await ctx.reply('❌ Something went wrong. Please try again.');
    }
  });

  // ─── Error handler ───────────────────────────────────────────
  bot.catch((err, ctx) => {
    console.error('[Bot] Unhandled error:', err);
    ctx.reply('❌ An unexpected error occurred. Please try again.').catch(() => {});
  });

  setBotInstance(bot);

  return bot;
}

module.exports = { createBot };
