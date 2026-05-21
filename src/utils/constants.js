/**
 * constants.js – Central place for business configuration and service catalogue.
 */

// ─── Laundry service catalogue ──────────────────────────────────
const SERVICES = [
  { id: 'shirt', name: 'Shirt', emoji: '👔', price: 500 },
  { id: 'jean_trouser', name: 'Jean Trouser', emoji: '👖', price: 800 },
  { id: 'tshirt', name: 'T-Shirt', emoji: '👕', price: 400 },
  { id: 'native_wear', name: 'Native Wear', emoji: '🥻', price: 1200 },
  { id: 'suit', name: 'Suit', emoji: '🤵', price: 2500 },
  { id: 'hoodie', name: 'Hoodie', emoji: '🧥', price: 1500 },
  { id: 'bedsheet', name: 'Bedsheet', emoji: '🛏️', price: 2000 },
  { id: 'curtain', name: 'Curtain', emoji: '🪟', price: 3500 },
];

// ─── Delivery config ────────────────────────────────────────────
const DELIVERY = {
  PICKUP_FEE: 3000,
  SELF_FEE: 0,
};

// ─── Order statuses (for tracking) ──────────────────────────────
const ORDER_STATUSES = ['pending', 'washing', 'drying', 'ready', 'delivered', 'cancelled'];

const ORDER_STATUS_EMOJI = {
  pending: '🟡',
  washing: '🔵',
  drying: '🟠',
  ready: '🟢',
  delivered: '✅',
  cancelled: '🔴',
};

// ─── Onboarding conversation steps ─────────────────────────────
const ONBOARDING_STEPS = {
  ASK_FIRST_NAME: 'ask_first_name',
  ASK_LAST_NAME: 'ask_last_name',
  ASK_EMAIL: 'ask_email',
};

// ─── Order flow conversation steps ──────────────────────────────
const ORDER_STEPS = {
  SELECTING_ITEMS: 'selecting_items',
  ENTER_QUANTITY: 'enter_quantity',
  CHOOSE_DELIVERY: 'choose_delivery',
  ASK_LODGE_NAME: 'ask_lodge_name',
  ASK_LODGE_ADDRESS: 'ask_lodge_address',
  ASK_LANDMARK: 'ask_landmark',
  ASK_PHONE: 'ask_phone',
  CONFIRM_ORDER: 'confirm_order',
  AWAITING_PAYMENT: 'awaiting_payment',
};

module.exports = {
  SERVICES,
  DELIVERY,
  ORDER_STATUSES,
  ORDER_STATUS_EMOJI,
  ONBOARDING_STEPS,
  ORDER_STEPS,
};
