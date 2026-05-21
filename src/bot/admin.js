/**
 * admin.js – Admin & worker commands with proper role separation.
 *
 * PERMISSIONS:
 * ┌────────────────────┬───────┬────────┐
 * │ Command            │ Admin │ Worker │
 * ├────────────────────┼───────┼────────┤
 * │ /orders            │  ✅   │   ❌   │
 * │ /pending           │  ✅   │   ❌   │
 * │ /paid              │  ✅   │   ❌   │
 * │ /customers         │  ✅   │   ❌   │
 * │ /stats             │  ✅   │   ❌   │
 * │ /track <ORDER>     │  ✅   │   ✅   │
 * │ /update <ORDER>    │  ✅   │   ✅   │
 * │ Status buttons     │  ✅   │   ✅   │
 * │ /staff             │  ✅   │   ✅   │
 * └────────────────────┴───────┴────────┘
 *
 * All messages use HTML parse mode to avoid Markdown escaping issues
 * with emails, usernames, dates, and special characters.
 */
const { User, Order, Payment, DeliveryDetail } = require('../models');
const { isAdmin, isWorker, isStaff, notifyStatusChange } = require('../services/notifications');
const { formatNaira, formatDate } = require('../utils/helpers');
const { ORDER_STATUSES, ORDER_STATUS_EMOJI } = require('../utils/constants');
const { orderStatusKeyboard } = require('./keyboards');

function registerAdmin(bot) {
  // ─── /staff → Show available commands based on role ────────
  bot.command('staff', async (ctx) => {
    try {
      const telegramId = ctx.from.id;

      if (isAdmin(telegramId)) {
        const msg =
          '👑 <b>Admin Commands</b>\n' +
          '━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
          '📊 <b>Monitoring:</b>\n' +
          '  /orders — View all orders (last 20)\n' +
          '  /pending — View unpaid orders\n' +
          '  /paid — View paid orders\n' +
          '  /customers — View all customers\n' +
          '  /stats — Sales &amp; revenue statistics\n\n' +
          '📦 <b>Order Management:</b>\n' +
          '  /track <code>ORDER_NUMBER</code> — Full order details\n' +
          '  /update <code>ORDER_NUMBER</code> <code>STATUS</code> — Update status\n\n' +
          '📋 <b>Statuses:</b> pending, washing, drying, ready, delivered, cancelled';

        return ctx.reply(msg, { parse_mode: 'HTML' });
      }

      if (isWorker(telegramId)) {
        const msg =
          '👷 <b>Worker Commands</b>\n' +
          '━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
          '📦 <b>Order Management:</b>\n' +
          '  /track <code>ORDER_NUMBER</code> — View order details + pickup info\n' +
          '  /update <code>ORDER_NUMBER</code> <code>STATUS</code> — Update order status\n\n' +
          '📋 <b>Statuses:</b> pending, washing, drying, ready, delivered, cancelled\n\n' +
          '💡 <i>When a new paid order comes in, you\'ll receive a notification automatically.</i>';

        return ctx.reply(msg, { parse_mode: 'HTML' });
      }

      return ctx.reply('🚫 This command is for staff only.');
    } catch (err) {
      console.error('[Admin] /staff error:', err);
      await ctx.reply('❌ Something went wrong.');
    }
  });

  // ─── /orders → All orders (ADMIN ONLY) ────────────────────
  bot.command('orders', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('🚫 This command is for admins only.\n\nWorkers can use /track and /update.');
    }

    try {
      const orders = await Order.find()
        .sort({ created_at: -1 })
        .limit(20)
        .populate('customer_id', 'first_name last_name telegram_username');

      if (!orders.length) return ctx.reply('📭 No orders found.');

      let msg = '📦 <b>Recent Orders (last 20):</b>\n\n';
      for (const o of orders) {
        const status = `${ORDER_STATUS_EMOJI[o.order_status] || '⚪'} ${o.order_status.toUpperCase()}`;
        const payment = o.payment_status === 'paid' ? '💚 PAID' : '🟡 UNPAID';
        const customer = o.customer_id
          ? `${o.customer_id.first_name} ${o.customer_id.last_name}`
          : 'Unknown';

        msg +=
          `<code>${o.order_number}</code> | ${status} | ${payment}\n` +
          `  👤 ${customer} | 💰 ${formatNaira(o.total_amount)}\n` +
          `  📅 ${formatDate(o.created_at)}\n\n`;
      }

      await ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[Admin] /orders error:', err);
      await ctx.reply('❌ Error fetching orders.');
    }
  });

  // ─── /pending → Unpaid orders (ADMIN ONLY) ────────────────
  bot.command('pending', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('🚫 This command is for admins only.');
    }

    try {
      const orders = await Order.find({ payment_status: 'unpaid' })
        .sort({ created_at: -1 })
        .limit(20)
        .populate('customer_id', 'first_name last_name telegram_username');

      if (!orders.length) return ctx.reply('✅ No pending (unpaid) orders.');

      let msg = '🟡 <b>Pending (Unpaid) Orders:</b>\n\n';
      for (const o of orders) {
        const customer = o.customer_id
          ? `${o.customer_id.first_name} ${o.customer_id.last_name}`
          : 'Unknown';
        msg +=
          `<code>${o.order_number}</code> | 💰 ${formatNaira(o.total_amount)}\n` +
          `  👤 ${customer} | 📅 ${formatDate(o.created_at)}\n\n`;
      }

      await ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[Admin] /pending error:', err);
      await ctx.reply('❌ Error fetching pending orders.');
    }
  });

  // ─── /paid → Paid orders (ADMIN ONLY) ─────────────────────
  bot.command('paid', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('🚫 This command is for admins only.');
    }

    try {
      const orders = await Order.find({ payment_status: 'paid' })
        .sort({ created_at: -1 })
        .limit(20)
        .populate('customer_id', 'first_name last_name telegram_username');

      if (!orders.length) return ctx.reply('📭 No paid orders found.');

      let msg = '💚 <b>Paid Orders (last 20):</b>\n\n';
      for (const o of orders) {
        const status = `${ORDER_STATUS_EMOJI[o.order_status] || '⚪'} ${o.order_status.toUpperCase()}`;
        const customer = o.customer_id
          ? `${o.customer_id.first_name} ${o.customer_id.last_name}`
          : 'Unknown';
        msg +=
          `<code>${o.order_number}</code> | ${status}\n` +
          `  👤 ${customer} | 💰 ${formatNaira(o.total_amount)}\n` +
          `  📅 ${formatDate(o.payment_date || o.created_at)}\n\n`;
      }

      await ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[Admin] /paid error:', err);
      await ctx.reply('❌ Error fetching paid orders.');
    }
  });

  // ─── /customers → All customers (ADMIN ONLY) ──────────────
  bot.command('customers', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('🚫 This command is for admins only.');
    }

    try {
      const users = await User.find().sort({ created_at: -1 }).limit(30);

      if (!users.length) return ctx.reply('📭 No customers found.');

      let msg = '👥 <b>Customers:</b>\n\n';
      for (const u of users) {
        const username = u.telegram_username ? `@${u.telegram_username}` : 'No username';
        msg +=
          `  👤 ${u.first_name} ${u.last_name}\n` +
          `  📧 ${u.email} | 💬 ${username}\n` +
          `  📅 Joined: ${formatDate(u.created_at)}\n\n`;
      }

      await ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[Admin] /customers error:', err);
      await ctx.reply('❌ Error fetching customers.');
    }
  });

  // ─── /stats → Sales statistics (ADMIN ONLY) ───────────────
  bot.command('stats', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('🚫 This command is for admins only.');
    }

    try {
      const totalOrders = await Order.countDocuments();
      const paidOrders = await Order.countDocuments({ payment_status: 'paid' });
      const unpaidOrders = await Order.countDocuments({ payment_status: 'unpaid' });
      const totalCustomers = await User.countDocuments();

      const revenueAgg = await Order.aggregate([
        { $match: { payment_status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$total_amount' } } },
      ]);
      const totalRevenue = revenueAgg.length > 0 ? revenueAgg[0].total : 0;

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayOrders = await Order.countDocuments({
        created_at: { $gte: todayStart },
      });
      const todayRevenueAgg = await Order.aggregate([
        { $match: { payment_status: 'paid', payment_date: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: '$total_amount' } } },
      ]);
      const todayRevenue = todayRevenueAgg.length > 0 ? todayRevenueAgg[0].total : 0;

      const statusBreakdown = await Order.aggregate([
        { $group: { _id: '$order_status', count: { $sum: 1 } } },
      ]);

      let statusText = '';
      for (const s of statusBreakdown) {
        const emoji = ORDER_STATUS_EMOJI[s._id] || '⚪';
        statusText += `  ${emoji} ${s._id.toUpperCase()}: ${s.count}\n`;
      }

      const msg =
        '📊 <b>Business Statistics</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
        `👥 <b>Total Customers:</b> ${totalCustomers}\n` +
        `📦 <b>Total Orders:</b> ${totalOrders}\n` +
        `✅ <b>Paid Orders:</b> ${paidOrders}\n` +
        `🟡 <b>Unpaid Orders:</b> ${unpaidOrders}\n\n` +
        `💰 <b>Total Revenue:</b> ${formatNaira(totalRevenue)}\n\n` +
        `📅 <b>Today:</b>\n` +
        `  📦 Orders: ${todayOrders}\n` +
        `  💰 Revenue: ${formatNaira(todayRevenue)}\n\n` +
        `📊 <b>Order Status Breakdown:</b>\n` +
        statusText;

      await ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[Admin] /stats error:', err);
      await ctx.reply('❌ Error fetching statistics.');
    }
  });

  // ─── /track <ORDER_NUMBER> → Track order (ADMIN + WORKER) ─
  bot.command('track', async (ctx) => {
    if (!isStaff(ctx.from.id)) {
      return ctx.reply('🚫 This command is for staff only.');
    }

    try {
      const args = ctx.message.text.split(' ').slice(1);
      const orderNumber = args[0];

      if (!orderNumber) {
        return ctx.reply(
          '📝 Usage: /track <code>LDRY-2025-0001</code>',
          { parse_mode: 'HTML' }
        );
      }

      const order = await Order.findOne({
        order_number: orderNumber.toUpperCase(),
      }).populate('customer_id', 'first_name last_name email telegram_username');

      if (!order) {
        return ctx.reply(`❌ Order <code>${orderNumber}</code> not found.`, { parse_mode: 'HTML' });
      }

      const customer = order.customer_id;
      const statusEmoji = ORDER_STATUS_EMOJI[order.order_status] || '⚪';
      const paymentEmoji = order.payment_status === 'paid' ? '💚' : '🟡';

      let msg =
        '🔍 <b>Order Details</b>\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        `🔢 Order: <code>${order.order_number}</code>\n` +
        `${statusEmoji} Status: <b>${order.order_status.toUpperCase()}</b>\n` +
        `${paymentEmoji} Payment: <b>${order.payment_status.toUpperCase()}</b>\n\n`;

      if (customer) {
        msg += `👤 Customer: ${customer.first_name} ${customer.last_name}\n`;
        msg += `📧 Email: ${customer.email}\n`;
        if (customer.telegram_username) msg += `💬 @${customer.telegram_username}\n`;
        msg += '\n';
      }

      msg += '🧺 <b>Items:</b>\n';
      for (const item of order.items) {
        msg += `  ${item.quantity}x ${item.name} = ${formatNaira(item.line_total)}\n`;
      }

      msg += `\n📦 Subtotal: ${formatNaira(order.subtotal)}\n`;

      if (order.delivery_type === 'pickup') {
        msg += `🚚 Pickup Delivery: ${formatNaira(order.delivery_fee)}\n`;
      } else {
        msg += `🏃 Self Delivery: FREE\n`;
      }

      msg += `💰 <b>Total: ${formatNaira(order.total_amount)}</b>\n`;
      msg += `📅 Created: ${formatDate(order.created_at)}\n`;

      if (order.payment_date) {
        msg += `💳 Paid: ${formatDate(order.payment_date)}\n`;
      }

      if (order.receipt_id) {
        msg += `🧾 Receipt: <code>${order.receipt_id}</code>\n`;
      }

      await ctx.reply(msg, { parse_mode: 'HTML' });

      // Pickup details
      if (order.delivery_type === 'pickup') {
        const delivery = await DeliveryDetail.findOne({ order_id: order._id });
        if (delivery) {
          await ctx.reply(
            `📍 <b>Pickup Details for ${order.order_number}:</b>\n\n` +
              `🏠 Lodge: ${delivery.lodge_name}\n` +
              `📫 Address: ${delivery.lodge_address}\n` +
              `🗺️ Landmark: ${delivery.landmark}\n` +
              `📞 Phone: ${delivery.phone_number}`,
            { parse_mode: 'HTML' }
          );
        }
      }

      // Show status update buttons (both admin and worker can update)
      if (order.order_status !== 'delivered') {
        await ctx.reply(
          `⚙️ <b>Update status for ${order.order_number}:</b>`,
          {
            parse_mode: 'HTML',
            ...orderStatusKeyboard(order.order_number),
          }
        );
      }
    } catch (err) {
      console.error('[Admin] /track error:', err);
      await ctx.reply('❌ Error tracking order.');
    }
  });

  // ─── /update <ORDER_NUMBER> <STATUS> → Update (ADMIN + WORKER) ─
  bot.command('update', async (ctx) => {
    if (!isStaff(ctx.from.id)) {
      return ctx.reply('🚫 This command is for staff only.');
    }

    try {
      const args = ctx.message.text.split(' ').slice(1);
      const orderNumber = args[0];
      const newStatus = args[1]?.toLowerCase();

      if (!orderNumber || !newStatus) {
        return ctx.reply(
          '📝 Usage: /update <code>LDRY-2025-0001</code> <code>washing</code>\n\n' +
            `Available statuses: ${ORDER_STATUSES.join(', ')}`,
          { parse_mode: 'HTML' }
        );
      }

      if (!ORDER_STATUSES.includes(newStatus)) {
        return ctx.reply(
          `⚠️ Invalid status. Choose from:\n${ORDER_STATUSES.join(', ')}`,
        );
      }

      const order = await Order.findOne({ order_number: orderNumber.toUpperCase() });
      if (!order) {
        return ctx.reply(`❌ Order <code>${orderNumber}</code> not found.`, { parse_mode: 'HTML' });
      }

      const oldStatus = order.order_status;
      order.order_status = newStatus;
      await order.save();

      // Notify customer
      await notifyStatusChange(order.telegram_id, order.order_number, oldStatus, newStatus);

      const updaterRole = isAdmin(ctx.from.id) ? '👑 Admin' : '👷 Worker';
      const updaterName = ctx.from.first_name || 'Staff';

      await ctx.reply(
        `✅ Order <code>${order.order_number}</code> updated:\n` +
          `${ORDER_STATUS_EMOJI[oldStatus]} ${oldStatus.toUpperCase()} → ` +
          `${ORDER_STATUS_EMOJI[newStatus]} ${newStatus.toUpperCase()}\n\n` +
          `Updated by: ${updaterRole} (${updaterName})\n` +
          `Customer has been notified ✅`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[Admin] /update error:', err);
      await ctx.reply('❌ Error updating order.');
    }
  });

  // ─── Status update via inline keyboard callback (ADMIN + WORKER) ─
  bot.action(/^status_(.+)_(.+)$/, async (ctx) => {
    try {
      if (!isStaff(ctx.from.id)) {
        await ctx.answerCbQuery('🚫 Staff only');
        return;
      }

      await ctx.answerCbQuery();

      const orderNumber = ctx.match[1];
      const newStatus = ctx.match[2];

      if (!ORDER_STATUSES.includes(newStatus)) return;

      const order = await Order.findOne({ order_number: orderNumber });
      if (!order) {
        await ctx.editMessageText(`❌ Order ${orderNumber} not found.`);
        return;
      }

      const oldStatus = order.order_status;
      order.order_status = newStatus;
      await order.save();

      // Notify customer
      await notifyStatusChange(order.telegram_id, order.order_number, oldStatus, newStatus);

      const updaterRole = isAdmin(ctx.from.id) ? '👑 Admin' : '👷 Worker';
      const updaterName = ctx.from.first_name || 'Staff';

      await ctx.editMessageText(
        `✅ Order <code>${order.order_number}</code> updated:\n` +
          `${ORDER_STATUS_EMOJI[oldStatus]} ${oldStatus.toUpperCase()} → ` +
          `${ORDER_STATUS_EMOJI[newStatus]} ${newStatus.toUpperCase()}\n\n` +
          `Updated by: ${updaterRole} (${updaterName})\n` +
          `Customer has been notified ✅`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[Admin] status callback error:', err);
    }
  });
}

module.exports = { registerAdmin };
