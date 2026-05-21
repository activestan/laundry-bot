/**
 * Webhook routes for Flutterwave payment notifications.
 */
const express = require('express');
const router = express.Router();
const verifyFlutterwaveWebhook = require('../middlewares/verifyFlutterwaveWebhook');
const { handleFlutterwaveWebhook } = require('../controllers/webhookController');

// POST /flutterwave/webhook
router.post('/webhook', verifyFlutterwaveWebhook, handleFlutterwaveWebhook);

module.exports = router;
