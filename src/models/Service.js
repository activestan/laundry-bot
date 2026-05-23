/**
 * Service Model
 * Dynamic laundry service catalogue stored in MongoDB.
 * Admins can add, edit, and remove items via bot commands.
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
