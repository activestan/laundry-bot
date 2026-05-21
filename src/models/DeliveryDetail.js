/**
 * DeliveryDetail Model
 * Stores pickup/delivery address information for orders with pickup delivery.
 */
const mongoose = require('mongoose');

const deliveryDetailSchema = new mongoose.Schema(
  {
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    order_number: {
      type: String,
      required: true,
    },
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    telegram_id: {
      type: Number,
      required: true,
    },
    lodge_name: {
      type: String,
      required: true,
      trim: true,
    },
    lodge_address: {
      type: String,
      required: true,
      trim: true,
    },
    landmark: {
      type: String,
      required: true,
      trim: true,
    },
    phone_number: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

module.exports = mongoose.model('DeliveryDetail', deliveryDetailSchema);
