/**
 * flutterwave.js – Flutterwave API integration service.
 *
 * Handles virtual account creation and payment verification.
 * Uses the Flutterwave v3 REST API via axios.
 */
const axios = require('axios');

const FLW_BASE = 'https://api.flutterwave.com/v3';

/**
 * Authenticated axios instance for Flutterwave.
 */
function flwClient() {
  return axios.create({
    baseURL: FLW_BASE,
    headers: {
      Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });
}

/**
 * Create a static virtual account for a customer.
 *
 * @param {Object} params
 * @param {string} params.email
 * @param {string} params.firstName
 * @param {string} params.lastName
 * @param {string} params.txRef      – unique reference, e.g. `LDRY-USR-<telegramId>`
 * @returns {Object} { account_number, bank_name, account_reference, order_ref, flw_ref }
 */
async function createVirtualAccount({ email, firstName, lastName, txRef, bvn }) {
  try {
    // Use BUSINESS_NAME from env so the account narration matches your brand
    const businessName = process.env.BUSINESS_NAME || 'Praisel Laundromat';

    const payload = {
      email,
      is_permanent: true,
      // BVN is required for production in Nigeria; pass a test BVN for sandbox
      bvn: bvn || '22222222222', // Flutterwave test BVN
      tx_ref: txRef,
      firstname: firstName,
      lastname: lastName,
      narration: `${firstName} ${lastName} – ${businessName}`,
    };

    const { data } = await flwClient().post('/virtual-account-numbers', payload);

    if (data.status !== 'success') {
      throw new Error(data.message || 'Flutterwave virtual account creation failed');
    }

    const d = data.data;
    return {
      account_number: d.account_number,
      bank_name: d.bank_name,
      account_reference: txRef,
      order_ref: d.order_ref || null,
      flw_ref: d.flw_ref || null,
    };
  } catch (err) {
    console.error('[Flutterwave] createVirtualAccount error:', err.response?.data || err.message);
    throw err;
  }
}

/**
 * Verify a transaction by its ID.
 *
 * @param {number|string} transactionId
 * @returns {Object} transaction data
 */
async function verifyTransaction(transactionId) {
  try {
    const { data } = await flwClient().get(`/transactions/${transactionId}/verify`);

    if (data.status !== 'success') {
      throw new Error(data.message || 'Transaction verification failed');
    }
    return data.data;
  } catch (err) {
    console.error('[Flutterwave] verifyTransaction error:', err.response?.data || err.message);
    throw err;
  }
}

module.exports = {
  createVirtualAccount,
  verifyTransaction,
};
