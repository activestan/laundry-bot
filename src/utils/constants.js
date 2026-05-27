/**
 * constants.js – Central place for business configuration.
 *
 * NOTE: Service catalogue (items & prices) is now stored in MongoDB
 * and managed via admin commands. See src/services/catalogue.js
 */

// ─── Delivery config ────────────────────────────────────────────
const DELIVERY = {
  PICKUP_FEE: 3000,
  SELF_FEE: 0,
};

// ─── Order statuses (for tracking) ──────────────────────────
const ORDER_STATUSES = ['pending', 'washing', 'drying', 'ready', 'delivered', 'cancelled'];

const ORDER_STATUS_EMOJI = {
  pending: '🟡',
  washing: '🔵',
  drying: '🟠',
  ready: '🟢',
  delivered: '✅',
  cancelled: '🔴',
};

// ─── Onboarding conversation steps ─────────────────────────
const ONBOARDING_STEPS = {
  ASK_FIRST_NAME: 'ask_first_name',
  ASK_LAST_NAME: 'ask_last_name',
  ASK_EMAIL: 'ask_email',
};

// ─── Order flow conversation steps ──────────────────────────
const ORDER_STEPS = {
  SELECTING_ITEMS: 'selecting_items',
  ENTER_QUANTITY: 'enter_quantity',
  CHOOSE_DELIVERY: 'choose_delivery',
  CHOOSE_PAYMENT_TIMING: 'choose_payment_timing',
  ASK_LODGE_NAME: 'ask_lodge_name',
  ASK_LODGE_ADDRESS: 'ask_lodge_address',
  ASK_LANDMARK: 'ask_landmark',
  ASK_PHONE: 'ask_phone',
  CONFIRM_ORDER: 'confirm_order',
  AWAITING_PAYMENT: 'awaiting_payment',
};

module.exports = {
  DELIVERY,
  ORDER_STATUSES,
  ORDER_STATUS_EMOJI,
  ONBOARDING_STEPS,
  ORDER_STEPS,
};
