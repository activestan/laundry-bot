/**
 * webhookController.js
 *
 * Handles incoming Flutterwave payment webhook events.
 *
 * For pay_on_collection orders: after payment confirmation,
 * asks the customer if they've collected their clothes.
 */
const { User, Order, Payment, DeliveryDetail } = require('../models');
const { verifyTransaction } = require('../services/flutterwave');
const { generateReceiptId } = require('../utils/helpers');
const { sendCustomerReceipt, notifyStaff } = require('../services/notifications');
const { collectionConfirmKeyboard } = require('../bot/keyboards');

let botInstance = null;

function setBotForWebhook(bot) {
  botInstance = bot;
}

async function handleFlutterwaveWebhook(req, res) {
  res.status(200).json({ status: 'ok' });

  try {
    const payload = req.body;
    console.log('[Webhook] Received event:', JSON.stringify(payload).substring(0, 300));

    if (payload.event !== 'charge.completed') {
      console.log('[Webhook] Ignoring non-charge event:', payload.event);
      return;
    }

    const txData = payload.data;
    if (!txData || txData.status !== 'successful') {
      console.log('[Webhook] Ignoring non-successful charge.');
      return;
    }

    // Verify with Flutterwave
    let verifiedTx;
    try {
      verifiedTx = await verifyTransaction(txData.id);
    } catch (err) {
      console.error('[Webhook] Transaction verification failed:', err.message);
      return;
    }

    if (verifiedTx.status !== 'successful') {
      console.log('[Webhook] Verified transaction is not successful:', verifiedTx.status);
      return;
    }

    // Find user
    const accountNumber = txData.account_number || verifiedTx.account_number;
    const txRef = txData.tx_ref || verifiedTx.tx_ref;

    let user = null;

    if (accountNumber) {
      user = await User.findOne({ 'virtual_account.account_number': accountNumber });
    }

    if (!user && txRef) {
      const match = txRef.match(/LDRY-USR-(\d+)/);
      if (match) {
        user = await User.findOne({ telegram_id: Number(match[1]) });
      }
    }

    if (!user) {
      user = await User.findOne({ 'virtual_account.account_reference': txRef });
    }

    if (!user) {
      console.error('[Webhook] Could not match payment to any user. txRef:', txRef);
      return;
    }

    console.log(`[Webhook] Matched payment to user: ${user.first_name} ${user.last_name} (${user.telegram_id})`);

    // Find the user's latest unpaid or pay_on_collection order
    const order = await Order.findOne({
      customer_id: user._id,
      payment_status: { $in: ['unpaid', 'pay_on_collection'] },
    }).sort({ created_at: -1 });

    if (!order) {
      console.warn('[Webhook] No unpaid order found for user:', user.telegram_id);
      await Payment.create({
        customer_id: user._id,
        telegram_id: user.telegram_id,
        flutterwave_tx_id: verifiedTx.id,
        flutterwave_tx_ref: verifiedTx.tx_ref,
        flutterwave_flw_ref: verifiedTx.flw_ref,
        amount: verifiedTx.amount,
        currency: verifiedTx.currency,
        status: 'successful',
        payment_type: verifiedTx.payment_type,
        raw_webhook: payload,
      });
      return;
    }

    const paidAmount = Number(verifiedTx.amount);
    const wasPayOnCollection = order.payment_status === 'pay_on_collection';

    // Update order
    const receiptId = generateReceiptId();
    order.payment_status = 'paid';
    order.payment_date = new Date();
    order.receipt_id = receiptId;
    await order.save();

    // Create payment record
    await Payment.create({
      order_id: order._id,
      order_number: order.order_number,
      customer_id: user._id,
      telegram_id: user.telegram_id,
      flutterwave_tx_id: verifiedTx.id,
      flutterwave_tx_ref: verifiedTx.tx_ref,
      flutterwave_flw_ref: verifiedTx.flw_ref,
      amount: paidAmount,
      currency: verifiedTx.currency,
      status: 'successful',
      payment_type: verifiedTx.payment_type,
      raw_webhook: payload,
    });

    console.log(`[Webhook] ✅ Order ${order.order_number} marked as PAID.`);

    // Get delivery details
    let deliveryDetail = null;
    if (order.delivery_type === 'pickup') {
      deliveryDetail = await DeliveryDetail.findOne({ order_id: order._id });
    }

    // Send receipt to customer
    await sendCustomerReceipt({ order, user, deliveryDetail });

    // Notify admin & workers
    await notifyStaff({ order, user, deliveryDetail });

    // If this was a pay_on_collection order, ask if they've collected
    if (wasPayOnCollection && botInstance) {
      try {
        await botInstance.telegram.sendMessage(
          user.telegram_id,
          `📦 <b>Have you collected your clothes?</b>\n\n` +
            `Order: <code>${order.order_number}</code>\n\n` +
            `Your payment has been confirmed. Please let us know if you've already picked up your laundry:`,
          {
            parse_mode: 'HTML',
            ...collectionConfirmKeyboard(order.order_number),
          }
        );
      } catch (err) {
        console.error('[Webhook] Collection prompt failed:', err.message);
      }
    }
  } catch (err) {
    console.error('[Webhook] Unhandled error:', err);
  }
}

module.exports = { handleFlutterwaveWebhook, setBotForWebhook };
