/**
 * catalogue.js – Dynamic service catalogue management.
 *
 * Loads services from MongoDB. Falls back to default seed data
 * if the database is empty (first boot).
 *
 * DISPLAY PRICING:
 *   Customers see prices minus 1 kobo (e.g. ₦1,799.99)
 *   Backend stores and charges the full round number (e.g. ₦1,800)
 */
const { Service } = require('../models');

// ─── Default services (seeded on first boot) ────────────────
const DEFAULT_SERVICES = [
  { id: 'shirt_tshirt', name: 'Shirts & T-Shirts', emoji: '👔', price: 900, sort_order: 1 },
  { id: 'trouser_jean', name: 'Trousers & Jeans', emoji: '👖', price: 900, sort_order: 2 },
  { id: 'native_wear', name: 'Native Wear', emoji: '🥻', price: 1800, sort_order: 3 },
  { id: 'suit', name: 'Suits', emoji: '🤵', price: 2500, sort_order: 4 },
  { id: 'duvet_bedspread', name: 'Duvets & Bedspreads', emoji: '🛏️', price: 2500, sort_order: 5 },
  { id: 'ironing_only', name: 'Ironing Only', emoji: '🔥', price: 300, sort_order: 6 },
];

/**
 * Seed default services if the collection is empty.
 */
async function seedDefaults() {
  const count = await Service.countDocuments();
  if (count === 0) {
    console.log('[Catalogue] Seeding default services...');
    await Service.insertMany(DEFAULT_SERVICES);
    console.log(`[Catalogue] ${DEFAULT_SERVICES.length} services seeded.`);
  }
}

/**
 * Get all active services from DB.
 * @returns {Array} Array of service objects
 */
async function getActiveServices() {
  await seedDefaults();
  return Service.find({ is_active: true }).sort({ sort_order: 1, name: 1 });
}

/**
 * Get a single service by ID.
 */
async function getServiceById(id) {
  return Service.findOne({ id: id.toLowerCase() });
}

/**
 * Format a price for DISPLAY to customers (minus 1 kobo).
 * e.g. 1800 → "₦1,799.99"
 * e.g. 900 → "₦899.99"
 * e.g. 300 → "₦299.99"
 */
function formatDisplayPrice(price) {
  const displayPrice = price - 0.01;
  return `₦${displayPrice.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format a price for BACKEND/RECEIPTS (full round number).
 * e.g. 1800 → "₦1,800"
 */
function formatFullPrice(price) {
  return `₦${Number(price).toLocaleString('en-NG')}`;
}

/**
 * Add a new service.
 */
async function addService({ id, name, emoji, price }) {
  const existing = await Service.findOne({ id: id.toLowerCase() });
  if (existing) {
    throw new Error(`Service "${id}" already exists.`);
  }

  const maxOrder = await Service.findOne().sort({ sort_order: -1 });
  const sortOrder = maxOrder ? maxOrder.sort_order + 1 : 1;

  return Service.create({
    id: id.toLowerCase(),
    name,
    emoji: emoji || '👕',
    price,
    sort_order: sortOrder,
  });
}

/**
 * Update price of an existing service.
 */
async function updatePrice(id, newPrice) {
  const service = await Service.findOne({ id: id.toLowerCase() });
  if (!service) {
    throw new Error(`Service "${id}" not found.`);
  }
  service.price = newPrice;
  await service.save();
  return service;
}

/**
 * Remove (deactivate) a service.
 */
async function removeService(id) {
  const service = await Service.findOne({ id: id.toLowerCase() });
  if (!service) {
    throw new Error(`Service "${id}" not found.`);
  }
  service.is_active = false;
  await service.save();
  return service;
}

/**
 * Reactivate a service.
 */
async function reactivateService(id) {
  const service = await Service.findOne({ id: id.toLowerCase() });
  if (!service) {
    throw new Error(`Service "${id}" not found.`);
  }
  service.is_active = true;
  await service.save();
  return service;
}

module.exports = {
  seedDefaults,
  getActiveServices,
  getServiceById,
  formatDisplayPrice,
  formatFullPrice,
  addService,
  updatePrice,
  removeService,
  reactivateService,
};
