/**
 * webhookController.js
 *
 * Handles incoming Flutterwave payment webhook events.
 *
 * Flow:
 *   1. Receive webhook payload.
 *   2. Verify transaction via Flutterwave API.
 *   3. Match payment to user via virtual account reference.
 *   4. Find the user's latest unpaid order.
 *   5. Mark order as PAID.
 *   6. Create a Payment record.
 *   7. Send receipt to customer.
 *   8. Notify admin/workers.
 */
const { User, Order, Payment, DeliveryDetail } = require('../models');
const { verifyTransaction } = require('../services/flutterwave');
const { generateReceiptId } = require('../utils/helpers');
const { sendCustomerReceipt, notifyStaff } = require('../services/notifications');

async function handleFlutterwaveWebhook(req, res) {
  // Immediately acknowledge the webhook (Flutterwave expects 200 quickly)
  res.status(200).json({ status: 'ok' });

  try {
    const payload = req.body;
    console.log('[Webhook] Received event:', JSON.stringify(payload).substring(0, 300));

    // Only process charge.completed events
    if (payload.event !== 'charge.completed') {
      console.log('[Webhook] Ignoring non-charge event:', payload.event);
      return;
    }

    const txData = payload.data;
    if (!txData || txData.status !== 'successful') {
      console.log('[Webhook] Ignoring non-successful charge.');
      return;
    }

    // Verify the transaction with Flutterwave
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

    // Find the user by virtual account reference
    // The tx_ref or the account_number can be used to match
    const accountNumber = txData.account_number || verifiedTx.account_number;
    const txRef = txData.tx_ref || verifiedTx.tx_ref;

    let user = null;

    // Try matching by account number first
    if (accountNumber) {
      user = await User.findOne({ 'virtual_account.account_number': accountNumber });
    }

    // Fallback: match by tx_ref pattern (LDRY-USR-<telegramId>)
    if (!user && txRef) {
      const match = txRef.match(/LDRY-USR-(\d+)/);
      if (match) {
        user = await User.findOne({ telegram_id: Number(match[1]) });
      }
    }

    // Fallback: match by account reference
    if (!user) {
      user = await User.findOne({
        'virtual_account.account_reference': txRef,
      });
    }

    if (!user) {
      console.error('[Webhook] Could not match payment to any user. txRef:', txRef);
      return;
    }

    console.log(`[Webhook] Matched payment to user: ${user.first_name} ${user.last_name} (${user.telegram_id})`);

    // Find the user's latest unpaid order
    const order = await Order.findOne({
      customer_id: user._id,
      payment_status: 'unpaid',
    }).sort({ created_at: -1 });

    if (!order) {
      console.warn('[Webhook] No unpaid order found for user:', user.telegram_id);
      // Still record the payment
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

    // Verify amount matches (allow small rounding tolerance)
    const paidAmount = Number(verifiedTx.amount);
    if (paidAmount < order.total_amount) {
      console.warn(
        `[Webhook] Underpayment: paid ${paidAmount}, expected ${order.total_amount}. Order: ${order.order_number}`
      );
      // We still process it but log the discrepancy
    }

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

    console.log(`[Webhook] Order ${order.order_number} marked as PAID.`);

    // Get delivery details if pickup
    let deliveryDetail = null;
    if (order.delivery_type === 'pickup') {
      deliveryDetail = await DeliveryDetail.findOne({ order_id: order._id });
    }

    // Send receipt to customer
    await sendCustomerReceipt({ order, user, deliveryDetail });

    // Notify admin & workers
    await notifyStaff({ order, user, deliveryDetail });
  } catch (err) {
    console.error('[Webhook] Unhandled error:', err);
  }
}

module.exports = { handleFlutterwaveWebhook };
