/**
 * admin.js – Admin & worker commands with proper role separation.
 */
const { User, Order, Payment, DeliveryDetail, Service } = require('../models');
const { isAdmin, isWorker, isStaff, notifyStatusChange } = require('../services/notifications');
const { formatNaira, formatDate } = require('../utils/helpers');
const { ORDER_STATUSES, ORDER_STATUS_EMOJI } = require('../utils/constants');
const { orderStatusKeyboard } = require('./keyboards');
const {
  getActiveServices,
  formatDisplayPrice,
  formatFullPrice,
  addService,
  updatePrice,
  updateBonusPrice,
  removeService,
  reactivateService,
  isBonusMode,
  setBonusMode,
} = require('../services/catalogue');
const { getDeliveryFee, setDeliveryFee } = require('../services/settings');

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
          '  /update <code>ORDER_NUMBER</code> <code>STATUS</code> — Update status\n' +
          '  /markpaid <code>ORDER_NUMBER</code> — Mark cash payment\n' +
          '  /cashpayments — View all cash payments\n\n' +
          '💰 <b>Price Management:</b>\n' +
          '  /bonusstatus — Check pricing mode\n' +
          '  /bonuson <code>PIN</code> — Activate bonus prices\n' +
          '  /bonusoff <code>PIN</code> — Switch to regular prices\n' +
          '  /setbonus <code>ITEM_ID</code> <code>PRICE</code> — Edit bonus price\n' +
          '  /pricelist — View all items &amp; prices\n' +
          '  /setprice <code>ITEM_ID</code> <code>PRICE</code> — Change price\n' +
          '  /additem <code>ID</code> <code>EMOJI</code> <code>PRICE</code> <code>NAME</code> — Add new item\n' +
          '  /removeitem <code>ITEM_ID</code> — Remove an item\n' +
          '  /restoreitem <code>ITEM_ID</code> — Restore a removed item\n' +
          '  /setdelivery <code>AMOUNT</code> — Change delivery fee\n\n' +
          '📋 <b>Statuses:</b> pending, washing, drying, ready, delivered, cancelled';

        return ctx.reply(msg, { parse_mode: 'HTML' });
      }

      if (isWorker(telegramId)) {
        const msg =
          '👷 <b>Worker Commands</b>\n' +
          '━━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
          '📦 <b>Order Management:</b>\n' +
          '  /track <code>ORDER_NUMBER</code> — View order details + pickup info\n' +
          '  /update <code>ORDER_NUMBER</code> <code>STATUS</code> — Update order status\n' +
          '  /markpaid <code>ORDER_NUMBER</code> — Mark cash payment\n' +
          '  /cashpayments — View all cash payments\n\n' +
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

  // ─── /pricelist → View all items & prices (ADMIN ONLY) ────
  bot.command('pricelist', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('🚫 This command is for admins only.');
    }

    try {
      const services = await Service.find().sort({ sort_order: 1 });

      if (!services.length) return ctx.reply('📭 No items in the catalogue.');

      const bonusMode = await isBonusMode();
      const modeLabel = bonusMode ? '🎁 BONUS MODE (Active)' : '💰 REGULAR MODE';

      let msg = '💰 <b>Price List (Admin View)</b>\n';
      msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
      msg += `📌 Current Mode: <b>${modeLabel}</b>\n\n`;

      for (const s of services) {
        const status = s.is_active ? '✅' : '❌';
        const activePrice = bonusMode && s.bonus_price ? s.bonus_price : s.price;
        msg += `${status} ${s.emoji} <b>${s.name}</b>\n`;
        msg += `  ID: <code>${s.id}</code>\n`;
        msg += `  Regular: ${formatFullPrice(s.price)}`;
        msg += s.bonus_price ? ` | Bonus: ${formatFullPrice(s.bonus_price)}` : ' | Bonus: not set';
        msg += `\n  👉 <b>Active: ${formatDisplayPrice(activePrice)}</b>\n\n`;
      }

      msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
      msg += '<b>Commands:</b>\n';
      msg += '  /setprice <code>item_id</code> <code>new_price</code>\n';
      msg += '  /additem <code>id</code> <code>emoji</code> <code>price</code> <code>name</code>\n';
      msg += '  /removeitem <code>item_id</code>';

      await ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[Admin] /pricelist error:', err);
      await ctx.reply('❌ Error fetching price list.');
    }
  });

  // ─── /setprice <ITEM_ID> <NEW_PRICE> → Change price (ADMIN ONLY) ─
  bot.command('setprice', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('🚫 This command is for admins only.');
    }

    try {
      const args = ctx.message.text.split(' ').slice(1);
      const itemId = args[0];
      const newPrice = parseInt(args[1], 10);

      if (!itemId || isNaN(newPrice) || newPrice < 1) {
        // Show available items
        const services = await getActiveServices();
        let msg = '📝 Usage: /setprice <code>item_id</code> <code>new_price</code>\n\n';
        msg += '<b>Available items:</b>\n';
        for (const s of services) {
          msg += `  <code>${s.id}</code> — ${s.name} (${formatFullPrice(s.price)})\n`;
        }
        msg += '\n<b>Example:</b> /setprice native_wear 2000';
        return ctx.reply(msg, { parse_mode: 'HTML' });
      }

      const service = await updatePrice(itemId, newPrice);

      await ctx.reply(
        `✅ Price updated!\n\n` +
          `${service.emoji} <b>${service.name}</b>\n` +
          `  Old display: customers will now see ${formatDisplayPrice(newPrice)}\n` +
          `  Backend charges: ${formatFullPrice(newPrice)}`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[Admin] /setprice error:', err);
      await ctx.reply(`❌ ${err.message || 'Error updating price.'}`);
    }
  });

  // ─── /additem <ID> <EMOJI> <PRICE> <NAME...> → Add item (ADMIN ONLY) ─
  bot.command('additem', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('🚫 This command is for admins only.');
    }

    try {
      const args = ctx.message.text.split(' ').slice(1);

      if (args.length < 4) {
        return ctx.reply(
          '📝 Usage: /additem <code>id</code> <code>emoji</code> <code>price</code> <code>name</code>\n\n' +
            '<b>Example:</b>\n' +
            '/additem towel 🧻 500 Towels\n' +
            '/additem blanket 🛏️ 3000 Blankets &amp; Throws\n\n' +
            '<b>Rules:</b>\n' +
            '• ID must be unique, lowercase, no spaces (use _ for spaces)\n' +
            '• Price is the full round number (e.g. 1800, not 1799.99)\n' +
            '• Name can have spaces',
          { parse_mode: 'HTML' }
        );
      }

      const id = args[0].toLowerCase().replace(/[^a-z0-9_]/g, '');
      const emoji = args[1];
      const price = parseInt(args[2], 10);
      const name = args.slice(3).join(' ');

      if (!id || id.length < 2) {
        return ctx.reply('⚠️ ID must be at least 2 characters (lowercase, underscores allowed).');
      }
      if (isNaN(price) || price < 1) {
        return ctx.reply('⚠️ Price must be a positive number.');
      }
      if (!name || name.length < 2) {
        return ctx.reply('⚠️ Name must be at least 2 characters.');
      }

      const service = await addService({ id, name, emoji, price });

      await ctx.reply(
        `✅ New item added!\n\n` +
          `${service.emoji} <b>${service.name}</b>\n` +
          `  ID: <code>${service.id}</code>\n` +
          `  Customers see: ${formatDisplayPrice(service.price)}\n` +
          `  Backend charges: ${formatFullPrice(service.price)}\n\n` +
          `Item is now live in the order menu.`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[Admin] /additem error:', err);
      await ctx.reply(`❌ ${err.message || 'Error adding item.'}`);
    }
  });

  // ─── /removeitem <ITEM_ID> → Remove item (ADMIN ONLY) ────
  bot.command('removeitem', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('🚫 This command is for admins only.');
    }

    try {
      const args = ctx.message.text.split(' ').slice(1);
      const itemId = args[0];

      if (!itemId) {
        const services = await getActiveServices();
        let msg = '📝 Usage: /removeitem <code>item_id</code>\n\n';
        msg += '<b>Active items:</b>\n';
        for (const s of services) {
          msg += `  <code>${s.id}</code> — ${s.name}\n`;
        }
        return ctx.reply(msg, { parse_mode: 'HTML' });
      }

      const service = await removeService(itemId);

      await ctx.reply(
        `✅ Item removed from menu!\n\n` +
          `${service.emoji} <b>${service.name}</b> (<code>${service.id}</code>)\n\n` +
          `<i>Item is hidden but not deleted. Existing orders with this item are not affected.</i>`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[Admin] /removeitem error:', err);
      await ctx.reply(`❌ ${err.message || 'Error removing item.'}`);
    }
  });


  // ─── /restoreitem <ITEM_ID> → Restore hidden item (ADMIN ONLY) ────
  bot.command('restoreitem', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('🚫 This command is for admins only.');
    }

    try {
      const args = ctx.message.text.split(' ').slice(1);
      const itemId = args[0];

      if (!itemId) {
        const services = await Service.find({ is_active: false }).sort({ sort_order: 1 });
        if (!services.length) return ctx.reply('✅ No hidden items to restore.');
        let msg = '📝 Usage: /restoreitem <code>item_id</code>\n\n';
        msg += '<b>Hidden items:</b>\n';
        for (const s of services) {
          msg += '  <code>' + s.id + '</code> — ' + s.name + '\n';
        }
        return ctx.reply(msg, { parse_mode: 'HTML' });
      }

      const service = await reactivateService(itemId);

      await ctx.reply(
        '✅ Item restored!\n\n' +
          '' + service.emoji + ' <b>' + service.name + '</b> (<code>' + service.id + '</code>)\n' +
          'Price: ' + formatDisplayPrice(service.price) + '\n\n' +
          '<i>Item is now visible in the order menu again.</i>',
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[Admin] /restoreitem error:', err);
      await ctx.reply('❌ ' + (err.message || 'Error restoring item.'));
    }
  });

  // ─── /setdelivery <AMOUNT> → Change delivery fee (ADMIN ONLY) ────
  bot.command('setdelivery', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('🚫 This command is for admins only.');
    }

    try {
      const args = ctx.message.text.split(' ').slice(1);
      const newFee = parseInt(args[0], 10);

      if (isNaN(newFee) || newFee < 0) {
        const currentFee = await getDeliveryFee();
        return ctx.reply(
          '📝 Usage: /setdelivery <code>amount</code>\n\n' +
          'Current delivery fee: <b>' + formatNaira(currentFee) + '</b>\n\n' +
          'Example: /setdelivery 2500',
          { parse_mode: 'HTML' }
        );
      }

      await setDeliveryFee(newFee);
      const { formatDisplayPrice } = require('../services/catalogue');

      await ctx.reply(
        '✅ Delivery fee updated!\n\n' +
        '🚚 Customers see: <b>' + formatDisplayPrice(newFee) + '</b>\n' +
        '💰 Backend charges: <b>' + formatNaira(newFee) + '</b>',
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[Admin] /setdelivery error:', err);
      await ctx.reply('❌ Error updating delivery fee.');
    }
  });
  // ─── /bonuson <PIN> → Activate bonus prices (ADMIN ONLY) ──
  bot.command('bonuson', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('🚫 This command is for admins only.');
    try {
      const args = ctx.message.text.split(' ').slice(1);
      const pin = args[0];
      const correctPin = process.env.BONUS_PIN || '1234';

      if (!pin) {
        return ctx.reply('📝 Usage: /bonuson <code>PIN</code>\n\n<i>Enter your admin PIN to activate bonus prices.</i>', { parse_mode: 'HTML' });
      }

      if (pin !== correctPin) {
        return ctx.reply('❌ Incorrect PIN.');
      }

      await setBonusMode(true);
      await ctx.reply(
        '🎁 <b>Bonus Mode ACTIVATED!</b>\n\n' +
        'All customers now see discounted bonus prices.\n' +
        'Use /pricelist to see the current prices.',
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[Admin] /bonuson error:', err);
      await ctx.reply('❌ Error activating bonus mode.');
    }
  });

  // ─── /bonusoff <PIN> → Deactivate bonus prices (ADMIN ONLY) ──
  bot.command('bonusoff', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('🚫 This command is for admins only.');
    try {
      const args = ctx.message.text.split(' ').slice(1);
      const pin = args[0];
      const correctPin = process.env.BONUS_PIN || '1234';

      if (!pin) {
        return ctx.reply('📝 Usage: /bonusoff <code>PIN</code>\n\n<i>Enter your admin PIN to switch to regular prices.</i>', { parse_mode: 'HTML' });
      }

      if (pin !== correctPin) {
        return ctx.reply('❌ Incorrect PIN.');
      }

      await setBonusMode(false);
      await ctx.reply(
        '💰 <b>Regular Mode ACTIVATED!</b>\n\n' +
        'All customers now see standard regular prices.\n' +
        'Use /pricelist to see the current prices.',
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[Admin] /bonusoff error:', err);
      await ctx.reply('❌ Error deactivating bonus mode.');
    }
  });

  // ─── /setbonus <ITEM_ID> <PRICE> → Edit bonus price (ADMIN ONLY) ──
  bot.command('setbonus', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('🚫 This command is for admins only.');
    try {
      const args = ctx.message.text.split(' ').slice(1);
      const itemId = args[0];
      const newPrice = parseInt(args[1], 10);

      if (!itemId || isNaN(newPrice) || newPrice < 1) {
        const services = await getActiveServices();
        let msg = '📝 Usage: /setbonus <code>item_id</code> <code>bonus_price</code>\n\n';
        msg += '<b>Available items:</b>\n';
        for (const s of services) {
          const bp = s.bonus_price ? formatFullPrice(s.bonus_price) : 'not set';
          msg += `  <code>${s.id}</code> — ${s.name} (Regular: ${formatFullPrice(s.price)} | Bonus: ${bp})\n`;
        }
        msg += '\n<b>Example:</b> /setbonus native_wear 800';
        return ctx.reply(msg, { parse_mode: 'HTML' });
      }

      const service = await updateBonusPrice(itemId, newPrice);

      await ctx.reply(
        '✅ Bonus price updated!\n\n' +
        `${service.emoji} <b>${service.name}</b>\n` +
        `  Regular: ${formatFullPrice(service.price)}\n` +
        `  Bonus: ${formatFullPrice(service.bonus_price)} ← updated\n` +
        `  Customers see: ${formatDisplayPrice(newPrice)} (when bonus mode is on)`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[Admin] /setbonus error:', err);
      await ctx.reply('❌ ' + (err.message || 'Error updating bonus price.'));
    }
  });

  // ─── /bonusstatus → Check current pricing mode (ADMIN ONLY) ──
  bot.command('bonusstatus', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return ctx.reply('🚫 This command is for admins only.');
    try {
      const bonusMode = await isBonusMode();
      const status = bonusMode
        ? '🎁 <b>Bonus Mode is ON</b>\n\nCustomers are seeing discounted bonus prices.\n\nTo switch to regular: /bonusoff <code>PIN</code>'
        : '💰 <b>Regular Mode is ON</b>\n\nCustomers are seeing standard prices.\n\nTo switch to bonus: /bonuson <code>PIN</code>';
      await ctx.reply(status, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[Admin] /bonusstatus error:', err);
      await ctx.reply('❌ Error checking bonus status.');
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


  // ─── /markpaid <ORDER_NUMBER> → Mark as cash paid (ADMIN + WORKER) ─
  bot.command('markpaid', async (ctx) => {
    if (!isStaff(ctx.from.id)) {
      return ctx.reply('🚫 This command is for staff only.');
    }

    try {
      const args = ctx.message.text.split(' ').slice(1);
      const orderNumber = args[0];

      if (!orderNumber) {
        return ctx.reply(
          '📝 Usage: /markpaid <code>LDRY-2025-0001</code>\n\n' +
          '<i>Use this when a customer pays cash in person.</i>',
          { parse_mode: 'HTML' }
        );
      }

      const order = await Order.findOne({ order_number: orderNumber.toUpperCase() });
      if (!order) {
        return ctx.reply('❌ Order <code>' + orderNumber + '</code> not found.', { parse_mode: 'HTML' });
      }

      if (order.payment_status === 'paid') {
        return ctx.reply('✅ Order <code>' + order.order_number + '</code> is already marked as paid.', { parse_mode: 'HTML' });
      }

      order.payment_status = 'paid';
      order.payment_date = new Date();
      const { generateReceiptId } = require('../utils/helpers');
      order.receipt_id = generateReceiptId();
      await order.save();

      const updaterRole = isAdmin(ctx.from.id) ? '👑 Admin' : '👷 Worker';
      const updaterName = ctx.from.first_name || 'Staff';
      const updaterId = ctx.from.id;

      // Record the cash payment with who collected it
      const { Payment } = require('../models');
      await Payment.create({
        order_id: order._id,
        order_number: order.order_number,
        customer_id: order.customer_id,
        telegram_id: order.telegram_id,
        amount: order.total_amount,
        currency: 'NGN',
        status: 'successful',
        payment_type: 'cash',
        raw_webhook: {
          type: 'cash_payment',
          collected_by: updaterName,
          collected_by_role: updaterRole,
          collected_by_telegram_id: updaterId,
          collected_at: new Date().toISOString(),
        },
      });

      await ctx.reply(
        '✅ Order <code>' + order.order_number + '</code> marked as <b>PAID (CASH)</b>\n\n' +
        '💰 Cash Collected: ' + formatNaira(order.total_amount) + '\n' +
        '📅 Date: ' + formatDate(new Date()) + '\n' +
        '👤 Collected by: ' + updaterRole + ' (' + updaterName + ')\n\n' +
        '📧 Customer has been sent a receipt.',
        { parse_mode: 'HTML' }
      );

      // Send receipt and notify
      const user = await User.findOne({ _id: order.customer_id });
      if (user) {
        const { DeliveryDetail: DD } = require('../models');
        let deliveryDetail = null;
        if (order.delivery_type === 'pickup') {
          deliveryDetail = await DD.findOne({ order_id: order._id });
        }
        const { sendCustomerReceipt, notifyStaff } = require('../services/notifications');
        await sendCustomerReceipt({ order, user, deliveryDetail });
        await notifyStaff({ order, user, deliveryDetail });
      }
    } catch (err) {
      console.error('[Admin] /markpaid error:', err);
      await ctx.reply('❌ Error marking order as paid.');
    }
  });

  // ─── /cashpayments → View all cash payments (ADMIN ONLY) ──
  bot.command('cashpayments', async (ctx) => {
    if (!isAdmin(ctx.from.id)) {
      return ctx.reply('🚫 This command is for admins only.');
    }

    try {
      const { Payment } = require('../models');
      const cashPayments = await Payment.find({ payment_type: 'cash' })
        .sort({ created_at: -1 })
        .limit(20)
        .populate('customer_id', 'first_name last_name');

      if (!cashPayments.length) {
        return ctx.reply('📭 No cash payments recorded yet.');
      }

      let totalCash = 0;
      let msg = '💵 <b>Cash Payments (last 20):</b>\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

      for (const p of cashPayments) {
        const customer = p.customer_id
          ? p.customer_id.first_name + ' ' + p.customer_id.last_name
          : 'Unknown';
        const collectedBy = p.raw_webhook && p.raw_webhook.collected_by
          ? p.raw_webhook.collected_by + ' (' + p.raw_webhook.collected_by_role + ')'
          : 'Unknown';

        msg +=
          '<code>' + p.order_number + '</code>\n' +
          '  👤 Customer: ' + customer + '\n' +
          '  💰 Amount: ' + formatNaira(p.amount) + '\n' +
          '  🧑 Collected by: ' + collectedBy + '\n' +
          '  📅 Date: ' + formatDate(p.created_at) + '\n\n';

        totalCash += p.amount;
      }

      msg += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
      msg += '💵 <b>Total Cash Collected:</b> ' + formatNaira(totalCash);

      await ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('[Admin] /cashpayments error:', err);
      await ctx.reply('❌ Error fetching cash payments.');
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
