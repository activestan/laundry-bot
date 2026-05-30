/**
 * ordering.js – Handles the complete order flow.
 *
 * PAYMENT LOGIC:
 *   Pickup Delivery  → Must pay upfront (transfer to virtual account)
 *   Self Delivery     → Choose: "Pay Now" or "Pay When Collecting"
 *
 * All messages use HTML parse mode.
 */
const { User, Order, DeliveryDetail } = require('../models');
const { ORDER_STEPS } = require('../utils/constants');
const { getDeliveryFee } = require('../services/settings');
const {
  sanitize,
  generateOrderNumber,
  calculateCart,
} = require('../utils/helpers');
const {
  getActiveServices,
  getServiceById,
  formatDisplayPrice,
  formatFullPrice,
} = require('../services/catalogue');
const {
  serviceMenuKeyboard,
  deliveryKeyboard,
  paymentTimingKeyboard,
  confirmOrderKeyboard,
  mainMenuKeyboard,
} = require('./keyboards');

/**
 * Register all ordering-related handlers.
 */
function registerOrdering(bot) {
  // ─── "New Order" button ────────────────────────────────────────
  bot.hears('🧺 New Order', async (ctx) => {
    try {
      const user = await User.findOne({ telegram_id: ctx.from.id });
      if (!user) {
        await ctx.reply('⚠️ Please register first with /start');
        return;
      }

      const services = await getActiveServices();

      ctx.session = ctx.session || {};
      ctx.session.step = ORDER_STEPS.SELECTING_ITEMS;
      ctx.session.cart = {};
      ctx.session.selectedItems = [];

      await ctx.reply(
        '🧺 <b>Select your laundry items</b>\n\n' +
          'Tap items to add them to your order.\n' +
          'When done, tap <b>"Done — Proceed"</b>.',
        {
          parse_mode: 'HTML',
          ...serviceMenuKeyboard(services, new Set()),
        }
      );
    } catch (err) {
      console.error('[Ordering] New Order error:', err);
      await ctx.reply('❌ Something went wrong. Please try again.');
    }
  });

  // ─── Item selection callback ──────────────────────────────────
  bot.action(/^select_item_(.+)$/, async (ctx) => {
    try {
      await ctx.answerCbQuery();

      const itemId = ctx.match[1];
      const service = await getServiceById(itemId);
      if (!service) return;

      ctx.session = ctx.session || {};
      ctx.session.cart = ctx.session.cart || {};
      ctx.session.selectedItems = ctx.session.selectedItems || [];

      if (ctx.session.cart[itemId]) {
        delete ctx.session.cart[itemId];
        ctx.session.selectedItems = ctx.session.selectedItems.filter((id) => id !== itemId);
        await ctx.answerCbQuery(`❌ Removed ${service.name}`);
      } else {
        ctx.session.cart[itemId] = {
          name: service.name,
          unit_price: service.active_price,
          quantity: 0,
        };
        ctx.session.selectedItems.push(itemId);

        ctx.session.step = ORDER_STEPS.ENTER_QUANTITY;
        ctx.session.currentItem = itemId;

        await ctx.editMessageText(
          `${service.emoji} <b>${service.name}</b> — ${formatDisplayPrice(service.active_price)} each\n\n` +
            `📝 <b>How many do you have?</b>\n` +
            `Enter a number:`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      const services = await getActiveServices();
      const selectedSet = new Set(Object.keys(ctx.session.cart));
      try {
        await ctx.editMessageReplyMarkup(serviceMenuKeyboard(services, selectedSet).reply_markup);
      } catch (e) {
        // Message not modified
      }
    } catch (err) {
      console.error('[Ordering] Item selection error:', err);
    }
  });

  // ─── "Done selecting" callback ────────────────────────────────
  bot.action('done_selecting', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      ctx.session = ctx.session || {};

      const cart = ctx.session.cart || {};
      const items = Object.values(cart).filter((i) => i.quantity > 0);

      if (items.length === 0) {
        await ctx.answerCbQuery('⚠️ Please select at least one item and set quantities.');
        return;
      }

      ctx.session.step = ORDER_STEPS.CHOOSE_DELIVERY;

      const { detailedItems, subtotal } = calculateCart(items);
      let summary = '🛒 <b>Your Cart:</b>\n\n';
      for (const item of detailedItems) {
        summary += `  ${item.quantity}x ${item.name} = ${formatDisplayPrice(item.line_total)}\n`;
      }
      summary += `\n📦 <b>Subtotal:</b> ${formatDisplayPrice(subtotal)}\n\n`;
      summary += '🚚 <b>Choose your delivery option:</b>';

      await ctx.editMessageText(summary, {
        parse_mode: 'HTML',
        ...deliveryKeyboard(await getDeliveryFee()),
      });
    } catch (err) {
      console.error('[Ordering] Done selecting error:', err);
    }
  });

  // ─── Pickup Delivery → must pay upfront ───────────────────────
  bot.action('delivery_pickup', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      ctx.session = ctx.session || {};
      ctx.session.deliveryType = 'pickup';
      const pickupFee = await getDeliveryFee();
      ctx.session.deliveryFee = pickupFee;
      ctx.session.paymentTiming = 'pay_now'; // Pickup always pays upfront
      ctx.session.step = ORDER_STEPS.ASK_LODGE_NAME;

      await ctx.editMessageText(
        `🚚 <b>Pickup Delivery selected</b>\n` +
          `Delivery fee: ${formatDisplayPrice(pickupFee)}\n\n` +
          `We need your pickup details.\n\n` +
          `🏠 <b>What is the name of your lodge/hostel/estate?</b>`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[Ordering] delivery_pickup error:', err);
    }
  });

  // ─── Self Delivery → ask when to pay ──────────────────────────
  bot.action('delivery_self', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      ctx.session = ctx.session || {};
      ctx.session.deliveryType = 'self';
      ctx.session.deliveryFee = 0;
      ctx.session.step = ORDER_STEPS.CHOOSE_PAYMENT_TIMING;

      await ctx.editMessageText(
        '🏃 <b>Self Delivery selected</b>\n\n' +
          'You\'ll drop off and collect your clothes yourself.\n\n' +
          '💰 <b>When would you like to pay?</b>',
        {
          parse_mode: 'HTML',
          ...paymentTimingKeyboard(),
        }
      );
    } catch (err) {
      console.error('[Ordering] delivery_self error:', err);
    }
  });

  // ─── Pay Now (self delivery) ──────────────────────────────────
  bot.action('pay_now', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      ctx.session = ctx.session || {};
      ctx.session.paymentTiming = 'pay_now';
      ctx.session.step = ORDER_STEPS.CONFIRM_ORDER;

      await showOrderSummary(ctx);
    } catch (err) {
      console.error('[Ordering] pay_now error:', err);
    }
  });

  // ─── Pay When Collecting (self delivery) ──────────────────────
  bot.action('pay_on_collection', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      ctx.session = ctx.session || {};
      ctx.session.paymentTiming = 'pay_on_collection';
      ctx.session.step = ORDER_STEPS.CONFIRM_ORDER;

      await showOrderSummary(ctx);
    } catch (err) {
      console.error('[Ordering] pay_on_collection error:', err);
    }
  });

  // ─── Confirm & Pay callback ───────────────────────────────────
  bot.action('confirm_pay', async (ctx) => {
    try {
      await ctx.answerCbQuery();
      await processOrderConfirmation(ctx);
    } catch (err) {
      console.error('[Ordering] confirm_pay error:', err);
      await ctx.reply('❌ Something went wrong. Please try again with 🧺 New Order.');
    }
  });

  // ─── Cancel order callback ────────────────────────────────────
  bot.action('cancel_order', async (ctx) => {
    try {
      await ctx.answerCbQuery('Order cancelled');
      ctx.session = ctx.session || {};
      delete ctx.session.step;
      delete ctx.session.cart;
      delete ctx.session.selectedItems;
      delete ctx.session.deliveryType;
      delete ctx.session.deliveryFee;
      delete ctx.session.paymentTiming;
      delete ctx.session.pickup;
      delete ctx.session.currentItem;

      await ctx.editMessageText('❌ Order cancelled.\n\nUse the menu to start a new order.');
    } catch (err) {
      console.error('[Ordering] cancel_order error:', err);
    }
  });
}

/**
 * Handle text messages during ordering flow.
 */
async function handleOrderingMessage(ctx) {
  if (!ctx.session || !ctx.session.step) return false;

  const step = ctx.session.step;
  const text = sanitize(ctx.message.text);

  // ─── Enter quantity ─────────────────────────────────────────
  if (step === ORDER_STEPS.ENTER_QUANTITY) {
    const quantity = parseInt(text, 10);
    if (isNaN(quantity) || quantity < 1 || quantity > 100) {
      await ctx.reply('⚠️ Please enter a valid number between 1 and 100.');
      return true;
    }

    const itemId = ctx.session.currentItem;
    if (ctx.session.cart && ctx.session.cart[itemId]) {
      ctx.session.cart[itemId].quantity = quantity;
    }

    delete ctx.session.currentItem;
    ctx.session.step = ORDER_STEPS.SELECTING_ITEMS;

    const service = await getServiceById(itemId);
    const services = await getActiveServices();
    const selectedSet = new Set(Object.keys(ctx.session.cart || {}));

    await ctx.reply(
      `✅ Added <b>${quantity}x ${service ? service.name : itemId}</b>\n\n` +
        `Select more items or tap <b>"Done — Proceed"</b>:`,
      {
        parse_mode: 'HTML',
        ...serviceMenuKeyboard(services, selectedSet),
      }
    );
    return true;
  }

  // ─── Pickup: Lodge name ─────────────────────────────────────
  if (step === ORDER_STEPS.ASK_LODGE_NAME) {
    if (text.length < 2) {
      await ctx.reply('⚠️ Please enter a valid lodge/hostel name.');
      return true;
    }
    ctx.session.pickup = ctx.session.pickup || {};
    ctx.session.pickup.lodge_name = text;
    ctx.session.step = ORDER_STEPS.ASK_LODGE_ADDRESS;
    await ctx.reply('📫 <b>What is the full address?</b>', { parse_mode: 'HTML' });
    return true;
  }

  // ─── Pickup: Lodge address ──────────────────────────────────
  if (step === ORDER_STEPS.ASK_LODGE_ADDRESS) {
    if (text.length < 5) {
      await ctx.reply('⚠️ Please enter a more detailed address.');
      return true;
    }
    ctx.session.pickup.lodge_address = text;
    ctx.session.step = ORDER_STEPS.ASK_LANDMARK;
    await ctx.reply(
      '🗺️ <b>Any nearby landmark?</b>\n<i>(e.g. "Opposite GTBank, beside the market")</i>',
      { parse_mode: 'HTML' }
    );
    return true;
  }

  // ─── Pickup: Landmark ───────────────────────────────────────
  if (step === ORDER_STEPS.ASK_LANDMARK) {
    ctx.session.pickup.landmark = text || 'N/A';
    ctx.session.step = ORDER_STEPS.ASK_PHONE;
    await ctx.reply(
      '📞 <b>What is your phone number?</b>\n<i>(e.g. 08012345678)</i>',
      { parse_mode: 'HTML' }
    );
    return true;
  }

  // ─── Pickup: Phone ──────────────────────────────────────────
  if (step === ORDER_STEPS.ASK_PHONE) {
    const phone = text.replace(/[\s\-()]/g, '');
    if (phone.length < 10 || phone.length > 15) {
      await ctx.reply('⚠️ Please enter a valid phone number (10-15 digits).');
      return true;
    }
    ctx.session.pickup.phone_number = phone;
    ctx.session.step = ORDER_STEPS.CONFIRM_ORDER;
    await showOrderSummary(ctx);
    return true;
  }

  return false;
}

/**
 * Display the complete order summary.
 */
async function showOrderSummary(ctx) {
  const cart = ctx.session.cart || {};
  const items = Object.values(cart).filter((i) => i.quantity > 0);
  const { detailedItems, subtotal } = calculateCart(items);
  const deliveryFee = ctx.session.deliveryFee || 0;
  const total = subtotal + deliveryFee;
  const paymentTiming = ctx.session.paymentTiming || 'pay_now';

  let summary = '📋 <b>ORDER SUMMARY</b>\n';
  summary += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  for (const item of detailedItems) {
    summary += `  ${item.quantity}x ${item.name} = ${formatDisplayPrice(item.line_total)}\n`;
  }

  summary += '\n';
  if (ctx.session.deliveryType === 'pickup') {
    summary += `  🚚 Pickup Delivery = ${formatDisplayPrice(deliveryFee)}\n`;
  } else {
    summary += `  🏃 Self Delivery = FREE\n`;
  }

  summary += '\n━━━━━━━━━━━━━━━━━━━━━━━━\n';
  summary += `  💰 <b>TOTAL = ${formatDisplayPrice(total)}</b>\n`;
  summary += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  // Show payment method
  if (paymentTiming === 'pay_on_collection') {
    summary += '🏪 <b>Payment:</b> Pay when collecting\n\n';
  } else if (ctx.session.deliveryType === 'pickup') {
    summary += '💳 <b>Payment:</b> Transfer before pickup\n\n';
  } else {
    summary += '💳 <b>Payment:</b> Pay now via transfer\n\n';
  }

  if (ctx.session.pickup) {
    summary += '📍 <b>Pickup Address:</b>\n';
    summary += `  🏠 ${ctx.session.pickup.lodge_name}\n`;
    summary += `  📫 ${ctx.session.pickup.lodge_address}\n`;
    summary += `  🗺️ ${ctx.session.pickup.landmark}\n`;
    summary += `  📞 ${ctx.session.pickup.phone_number}\n\n`;
  }

  summary += 'Tap <b>"Confirm Order"</b> to proceed.';

  await ctx.reply(summary, {
    parse_mode: 'HTML',
    ...confirmOrderKeyboard(),
  });
}

/**
 * Process the confirmed order.
 */
async function processOrderConfirmation(ctx) {
  const telegramId = ctx.from.id;
  const user = await User.findOne({ telegram_id: telegramId });

  if (!user) {
    await ctx.editMessageText('⚠️ Please register first with /start');
    return;
  }

  const cart = ctx.session.cart || {};
  const rawItems = Object.values(cart).filter((i) => i.quantity > 0);

  if (rawItems.length === 0) {
    await ctx.editMessageText('⚠️ Your cart is empty. Start a new order.');
    return;
  }

  const { detailedItems, subtotal } = calculateCart(rawItems);
  const deliveryType = ctx.session.deliveryType || 'self';
  const deliveryFee = ctx.session.deliveryFee || 0;
  const totalAmount = subtotal + deliveryFee;
  const paymentTiming = ctx.session.paymentTiming || 'pay_now';

  const orderNumber = await generateOrderNumber();

  const order = await Order.create({
    order_number: orderNumber,
    customer_id: user._id,
    telegram_id: telegramId,
    items: detailedItems,
    subtotal,
    delivery_type: deliveryType,
    delivery_fee: deliveryFee,
    total_amount: totalAmount,
    payment_status: paymentTiming === 'pay_on_collection' ? 'pay_on_collection' : 'unpaid',
    order_status: 'pending',
  });

  if (deliveryType === 'pickup' && ctx.session.pickup) {
    await DeliveryDetail.create({
      order_id: order._id,
      order_number: orderNumber,
      customer_id: user._id,
      telegram_id: telegramId,
      lodge_name: ctx.session.pickup.lodge_name,
      lodge_address: ctx.session.pickup.lodge_address,
      landmark: ctx.session.pickup.landmark,
      phone_number: ctx.session.pickup.phone_number,
    });
  }

  // Clear session
  delete ctx.session.step;
  delete ctx.session.cart;
  delete ctx.session.selectedItems;
  delete ctx.session.deliveryType;
  delete ctx.session.deliveryFee;
  delete ctx.session.paymentTiming;
  delete ctx.session.pickup;
  delete ctx.session.currentItem;

  // ─── Build confirmation message based on payment timing ─────
  let msg =
    `✅ <b>Order Placed Successfully!</b>\n\n` +
    `🔢 <b>Order Number:</b> <code>${orderNumber}</code>\n` +
    `💰 <b>Total:</b> ${formatFullPrice(totalAmount)}\n\n`;

  if (paymentTiming === 'pay_on_collection') {
    // Pay when collecting — no account number shown
    msg +=
      `🏪 <b>Payment Method:</b> Pay when collecting\n\n` +
      `Please bring your clothes to our location.\n` +
      `You'll pay <b>${formatFullPrice(totalAmount)}</b> when you pick up your clean laundry.\n\n` +
      `📌 <i>Keep your order number safe: <code>${orderNumber}</code></i>\n\n` +
      `📱 For questions, WhatsApp: ${process.env.BUSINESS_WHATSAPP || '+234XXXXXXXXXX'}`;
  } else {
    // Pay now — show account number
    if (user.virtual_account && user.virtual_account.account_number) {
      msg +=
        `💳 <b>To complete your order, transfer exactly</b>\n` +
        `<b>${formatFullPrice(totalAmount)}</b> to:\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🏦 <b>Bank:</b> ${user.virtual_account.bank_name}\n` +
        `🔢 <b>Account:</b> <code>${user.virtual_account.account_number}</code>\n` +
        `📝 <b>Name:</b> ${user.first_name} ${user.last_name}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `⏳ Once we confirm your payment, you'll receive\n` +
        `a receipt and your order will begin processing.\n\n` +
        `📌 <i>Keep your order number safe: <code>${orderNumber}</code></i>`;
    } else {
      msg +=
        `⚠️ Your payment account is not set up yet.\n` +
        `Please contact support for manual payment instructions.\n` +
        `📱 WhatsApp: ${process.env.BUSINESS_WHATSAPP || '+234XXXXXXXXXX'}`;
    }
  }

  await ctx.editMessageText(msg, { parse_mode: 'HTML' });
}

module.exports = { registerOrdering, handleOrderingMessage };
