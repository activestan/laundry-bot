/**
 * Settings Model
 * Key-value store for business settings that admins can change from the bot.
 * Examples: delivery_fee, business_whatsapp, etc.
 */
const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    label: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

/**
 * Get a setting value by key, with a default fallback.
 */
settingsSchema.statics.getValue = async function (key, defaultValue) {
  const doc = await this.findOne({ key });
  return doc ? doc.value : defaultValue;
};

/**
 * Set a setting value by key.
 */
settingsSchema.statics.setValue = async function (key, value, label) {
  return this.findOneAndUpdate(
    { key },
    { key, value, ...(label ? { label } : {}) },
    { upsert: true, new: true }
  );
};

module.exports = mongoose.model('Settings', settingsSchema);
