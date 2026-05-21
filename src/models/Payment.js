/**
 * Payment Model
 * Records every successful (and failed) payment event from Flutterwave webhooks.
 */
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    order_number: {
      type: String,
      default: null,
    },
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    telegram_id: {
      type: Number,
      default: null,
    },
    flutterwave_tx_id: {
      type: Number,
      default: null,
    },
    flutterwave_tx_ref: {
      type: String,
      default: null,
    },
    flutterwave_flw_ref: {
      type: String,
      default: null,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'NGN',
    },
    status: {
      type: String,
      enum: ['successful', 'failed', 'pending'],
      required: true,
    },
    payment_type: {
      type: String,
      default: 'bank_transfer',
    },
    raw_webhook: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

module.exports = mongoose.model('Payment', paymentSchema);
