/**
 * helpers.js – Reusable utility functions.
 */
const validator = require('validator');
const { Counter } = require('../models');

/**
 * Format a number as Nigerian Naira.
 */
function formatNaira(amount) {
  return `₦${Number(amount).toLocaleString('en-NG')}`;
}

/**
 * Validate email format.
 */
function isValidEmail(email) {
  return validator.isEmail(String(email).trim());
}

/**
 * Sanitize user-supplied text: trim, strip HTML-like tags.
 */
function sanitize(text) {
  if (!text) return '';
  return String(text)
    .trim()
    .replace(/[<>]/g, '')
    .substring(0, 500); // cap length
}

/**
 * Generate a unique, human-friendly order number.
 * Format: LDRY-YYYY-NNNN  (e.g. LDRY-2025-0001)
 */
async function generateOrderNumber() {
  const year = new Date().getFullYear();
  const counterKey = `order_${year}`;
  const seq = await Counter.getNextSequence(counterKey);
  return `LDRY-${year}-${String(seq).padStart(4, '0')}`;
}

/**
 * Generate a unique receipt ID.
 * Format: RCP-timestamp-random
 */
function generateReceiptId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `RCP-${ts}-${rand}`;
}

/**
 * Calculate cart totals from an array of { name, unit_price, quantity }.
 */
function calculateCart(items) {
  const detailedItems = items.map((item) => ({
    ...item,
    line_total: item.unit_price * item.quantity,
  }));
  const subtotal = detailedItems.reduce((sum, i) => sum + i.line_total, 0);
  return { detailedItems, subtotal };
}

/**
 * Escape Markdown V2 special chars for Telegram.
 */
function escMd(text) {
  if (!text) return '';
  return String(text).replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/**
 * Simple date formatter.
 */
function formatDate(date) {
  return new Date(date).toLocaleString('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Lagos',
  });
}

module.exports = {
  formatNaira,
  isValidEmail,
  sanitize,
  generateOrderNumber,
  generateReceiptId,
  calculateCart,
  escMd,
  formatDate,
};
