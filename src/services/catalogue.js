/**
 * catalogue.js – Dynamic service catalogue management.
 *
 * PRICING MODES:
 *   Regular Mode: customers see regular prices
 *   Bonus Mode:   customers see discounted bonus prices (for promos/launch)
 *
 * The mode is stored in the Settings collection as "bonus_mode" (true/false).
 * Admin switches with a PIN-protected command.
 *
 * DISPLAY PRICING:
 *   Customers see prices minus 1 kobo (e.g. ₦1,799.99)
 *   Backend stores and charges the full round number (e.g. ₦1,800)
 */
const { Service, Settings } = require('../models');

// ─── Default services with both regular and bonus prices ────
const DEFAULT_SERVICES = [
  { id: 'shirt_tshirt',      name: 'Shirts & T-Shirts',      emoji: '👔',  price: 900,  bonus_price: 500,  sort_order: 1 },
  { id: 'gown',              name: 'Gown',                   emoji: '👗',  price: 900,  bonus_price: 500,  sort_order: 2 },
  { id: 'native_wear',       name: 'Native Wear',            emoji: '🥻',  price: 1800, bonus_price: 1000, sort_order: 3 },
  { id: 'sneakers',          name: 'Sneakers',               emoji: '👟',  price: 1500, bonus_price: 900,  sort_order: 4 },
  { id: 'joggers_jeans',     name: 'Joggers/Jeans',          emoji: '👖',  price: 900,  bonus_price: 600,  sort_order: 5 },
  { id: 'bedspread',         name: 'Bedspread',              emoji: '🛏️', price: 1200, bonus_price: 700,  sort_order: 6 },
  { id: 'suit',              name: 'Suits',                  emoji: '🤵',  price: 2500, bonus_price: 1500, sort_order: 7 },
  { id: 'shorts_trousers',   name: 'Shorts/Trousers',       emoji: '🩳',  price: 900,  bonus_price: 600,  sort_order: 8 },
  { id: 'cap',               name: 'Cap',                    emoji: '🧢',  price: 700,  bonus_price: 400,  sort_order: 9 },
  { id: 'underwears',        name: 'Underwears',             emoji: '🩲',  price: 800,  bonus_price: 500,  sort_order: 10 },
  { id: 'agbada',            name: 'Agbada',                 emoji: '👘',  price: 3500, bonus_price: 2500, sort_order: 11 },
  { id: 'ironing_only',      name: 'Ironing Only',           emoji: '🔥',  price: 700,  bonus_price: 500,  sort_order: 12 },
  { id: 'sweatshirt_hoodie', name: 'Sweatshirt/Hoodies',     emoji: '🧥',  price: 900,  bonus_price: 600,  sort_order: 13 },
  { id: 'garment',           name: 'Garment',                emoji: '👚',  price: 1500, bonus_price: 1000, sort_order: 14 },
  { id: 'pillowcase',        name: 'Pillowcase',             emoji: '🛌',  price: 700,  bonus_price: 400,  sort_order: 15 },
  { id: 'duvet_6x6',         name: '6x6 Duvet',              emoji: '🛏️', price: 3500, bonus_price: 2500, sort_order: 16 },
  { id: 'duvet_4x4',         name: '4x4 Duvet',              emoji: '🛏️', price: 3000, bonus_price: 2000, sort_order: 17 },
];

/**
 * Seed default services if the collection is empty.
 * Also seeds bonus_mode = true (start in bonus mode for launch).
 */
async function seedDefaults() {
  const count = await Service.countDocuments();
  if (count === 0) {
    console.log('[Catalogue] Seeding default services with bonus prices...');
    await Service.insertMany(DEFAULT_SERVICES);
    // Start in bonus mode for launch
    await Settings.setValue('bonus_mode', true, 'Bonus/Promo Pricing Mode');
    console.log(`[Catalogue] ${DEFAULT_SERVICES.length} services seeded. Bonus mode: ON`);
  }
}

/**
 * Check if bonus mode is active.
 */
async function isBonusMode() {
  return Settings.getValue('bonus_mode', false);
}

/**
 * Set bonus mode on/off.
 */
async function setBonusMode(enabled) {
  await Settings.setValue('bonus_mode', enabled, 'Bonus/Promo Pricing Mode');
}

/**
 * Get the active price for a service (bonus or regular).
 */
function getActivePrice(service, bonusMode) {
  if (bonusMode && service.bonus_price !== null && service.bonus_price !== undefined) {
    return service.bonus_price;
  }
  return service.price;
}

/**
 * Get all active services from DB with correct prices based on mode.
 * Returns service objects with an `active_price` field added.
 */
async function getActiveServices() {
  await seedDefaults();
  const bonusMode = await isBonusMode();
  const services = await Service.find({ is_active: true }).sort({ sort_order: 1, name: 1 });

  return services.map((s) => {
    const doc = s.toObject();
    doc.active_price = getActivePrice(s, bonusMode);
    doc.is_bonus = bonusMode && s.bonus_price !== null && s.bonus_price !== undefined;
    return doc;
  });
}

/**
 * Get a single service by ID with active price.
 */
async function getServiceById(id) {
  const service = await Service.findOne({ id: id.toLowerCase() });
  if (!service) return null;
  const bonusMode = await isBonusMode();
  const doc = service.toObject();
  doc.active_price = getActivePrice(service, bonusMode);
  doc.is_bonus = bonusMode && service.bonus_price !== null;
  return doc;
}

/**
 * Format a price for DISPLAY to customers (minus 1 kobo).
 */
function formatDisplayPrice(price) {
  const displayPrice = price - 0.01;
  return `₦${displayPrice.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format a price for BACKEND/RECEIPTS (full round number).
 */
function formatFullPrice(price) {
  return `₦${Number(price).toLocaleString('en-NG')}`;
}

/**
 * Add a new service.
 */
async function addService({ id, name, emoji, price, bonus_price }) {
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
    bonus_price: bonus_price || null,
    sort_order: sortOrder,
  });
}

/**
 * Update regular price.
 */
async function updatePrice(id, newPrice) {
  const service = await Service.findOne({ id: id.toLowerCase() });
  if (!service) throw new Error(`Service "${id}" not found.`);
  service.price = newPrice;
  await service.save();
  return service;
}

/**
 * Update bonus price.
 */
async function updateBonusPrice(id, newBonusPrice) {
  const service = await Service.findOne({ id: id.toLowerCase() });
  if (!service) throw new Error(`Service "${id}" not found.`);
  service.bonus_price = newBonusPrice;
  await service.save();
  return service;
}

/**
 * Remove (deactivate) a service.
 */
async function removeService(id) {
  const service = await Service.findOne({ id: id.toLowerCase() });
  if (!service) throw new Error(`Service "${id}" not found.`);
  service.is_active = false;
  await service.save();
  return service;
}

/**
 * Reactivate a service.
 */
async function reactivateService(id) {
  const service = await Service.findOne({ id: id.toLowerCase() });
  if (!service) throw new Error(`Service "${id}" not found.`);
  service.is_active = true;
  await service.save();
  return service;
}

module.exports = {
  seedDefaults,
  isBonusMode,
  setBonusMode,
  getActiveServices,
  getServiceById,
  formatDisplayPrice,
  formatFullPrice,
  addService,
  updatePrice,
  updateBonusPrice,
  removeService,
  reactivateService,
};
