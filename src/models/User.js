/**
 * User Model
 * Stores Telegram user info, personal details, and linked Flutterwave virtual account.
 */
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    telegram_id: {
      type: Number,
      required: true,
      unique: true,
      index: true,
    },
    telegram_username: {
      type: String,
      default: null,
    },
    first_name: {
      type: String,
      required: true,
      trim: true,
    },
    last_name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    // Flutterwave virtual account details
    virtual_account: {
      account_number: { type: String, default: null },
      bank_name: { type: String, default: null },
      account_reference: { type: String, default: null },
      flutterwave_order_ref: { type: String, default: null },
      flutterwave_flw_ref: { type: String, default: null },
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

module.exports = mongoose.model('User', userSchema);
