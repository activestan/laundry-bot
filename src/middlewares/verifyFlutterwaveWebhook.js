/**
 * verifyFlutterwaveWebhook.js
 *
 * Middleware that verifies the Flutterwave webhook signature.
 * Flutterwave sends a `verif-hash` header that must match
 * the FLUTTERWAVE_WEBHOOK_HASH env variable you configure
 * in your Flutterwave dashboard.
 */
function verifyFlutterwaveWebhook(req, res, next) {
  const secretHash = process.env.FLUTTERWAVE_WEBHOOK_HASH;

  if (!secretHash) {
    console.error('[Webhook] FLUTTERWAVE_WEBHOOK_HASH is not configured.');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const signature = req.headers['verif-hash'];

  if (!signature || signature !== secretHash) {
    console.warn('[Webhook] Invalid webhook signature received.');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  next();
}

module.exports = verifyFlutterwaveWebhook;
