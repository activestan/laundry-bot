/**
 * Service Model
 * Dynamic laundry service catalogue stored in MongoDB.
 *
 * Each service has TWO prices:
 *   - price: the current REGULAR price
 *   - bonus_price: the discounted promo price
 *
 * The active price is determined by the global "bonus_mode" setting.
 */
const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    emoji: {
      type: String,
      default: '👕',
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    bonus_price: {
      type: Number,
      default: null,
      min: 0,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    sort_order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

module.exports = mongoose.model('Service', serviceSchema);
