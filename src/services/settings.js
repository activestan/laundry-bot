/**
 * settings.js – Business settings management.
 *
 * Stores configurable values in MongoDB so admins can change them
 * from the bot without touching code or env vars.
 */
const { Settings } = require('../models');

// ─── Default values (used if not yet set in DB) ─────────────
const DEFAULTS = {
  delivery_fee: { value: 3000, label: 'Pickup Delivery Fee' },
};

/**
 * Get the current pickup delivery fee.
 */
async function getDeliveryFee() {
  return Settings.getValue('delivery_fee', DEFAULTS.delivery_fee.value);
}

/**
 * Set the pickup delivery fee.
 */
async function setDeliveryFee(amount) {
  return Settings.setValue('delivery_fee', amount, 'Pickup Delivery Fee');
}

/**
 * Get all settings for admin display.
 */
async function getAllSettings() {
  const settings = await Settings.find().sort({ key: 1 });

  // Include defaults that haven't been set yet
  const result = [];
  for (const [key, def] of Object.entries(DEFAULTS)) {
    const existing = settings.find((s) => s.key === key);
    result.push({
      key,
      value: existing ? existing.value : def.value,
      label: existing ? existing.label : def.label,
      isDefault: !existing,
    });
  }

  // Include any extra settings not in defaults
  for (const s of settings) {
    if (!DEFAULTS[s.key]) {
      result.push({ key: s.key, value: s.value, label: s.label, isDefault: false });
    }
  }

  return result;
}

module.exports = {
  getDeliveryFee,
  setDeliveryFee,
  getAllSettings,
};
