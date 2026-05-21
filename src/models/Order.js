/**
 * Order Model
 * Core collection – tracks every laundry order from creation to delivery.
 */
const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    unit_price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    line_total: { type: Number, required: true },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    order_number: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    telegram_id: {
      type: Number,
      required: true,
      index: true,
    },
    items: [orderItemSchema],
    subtotal: {
      type: Number,
      required: true,
    },
    delivery_type: {
      type: String,
      enum: ['pickup', 'self'],
      required: true,
    },
    delivery_fee: {
      type: Number,
      default: 0,
    },
    total_amount: {
      type: Number,
      required: true,
    },
    payment_status: {
      type: String,
      enum: ['unpaid', 'paid', 'refunded'],
      default: 'unpaid',
    },
    order_status: {
      type: String,
      enum: ['pending', 'washing', 'drying', 'ready', 'delivered', 'cancelled'],
      default: 'pending',
    },
    payment_date: {
      type: Date,
      default: null,
    },
    receipt_id: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

module.exports = mongoose.model('Order', orderSchema);
