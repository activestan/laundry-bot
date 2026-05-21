/**
 * server.js – Application entry point.
 *
 * Sets up Express server, connects to MongoDB, launches the Telegram bot,
 * and registers the Flutterwave webhook route.
 *
 * Cron jobs:
 *   - 9 PM daily: Send sales summary to admins
 *   - 2 AM daily: Delete unpaid orders older than 30 days
 */
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cron = require('node-cron');

const { createBot } = require('./bot');
const webhookRoutes = require('./routes/webhook');
const { sendDailySummary } = require('./services/notifications');
const { Order, Payment, DeliveryDetail } = require('./models');

// ─── Validate required environment variables ─────────────────
const REQUIRED_ENV = ['BOT_TOKEN', 'MONGODB_URI', 'FLUTTERWAVE_SECRET_KEY'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌ Missing required env variable: ${key}`);
    process.exit(1);
  }
}

const PORT = process.env.PORT || 3000;

// ─── Express app ─────────────────────────────────────────────
const app = express();

// Parse JSON bodies (needed for webhooks)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Health check endpoint ───────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: process.env.BUSINESS_NAME || 'FreshPress Laundry Bot',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// ─── Flutterwave webhook routes ──────────────────────────────
app.use('/flutterwave', webhookRoutes);

// ─── Start everything ────────────────────────────────────────
async function start() {
  try {
    // 1. Connect to MongoDB
    console.log('📦 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected.');

    // 2. Create and launch Telegram bot
    console.log('🤖 Starting Telegram bot...');
    const bot = createBot();

    // Use webhook mode if BASE_URL is set, otherwise long polling
    if (process.env.BASE_URL) {
      const webhookPath = `/telegram-webhook/${process.env.BOT_TOKEN}`;
      const webhookUrl = `${process.env.BASE_URL}${webhookPath}`;

      app.use(bot.webhookCallback(webhookPath));

      // Set the webhook after the server starts
      setTimeout(async () => {
        try {
          await bot.telegram.setWebhook(webhookUrl);
          console.log(`✅ Telegram webhook set: ${webhookUrl}`);
        } catch (err) {
          console.error('❌ Failed to set Telegram webhook:', err.message);
          // Fall back to polling
          console.log('🔄 Falling back to long polling...');
          bot.launch();
        }
      }, 2000);
    } else {
      // Long polling mode (good for development)
      bot.launch();
      console.log('✅ Bot launched in long polling mode.');
    }

    // 3. Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 Webhook endpoint: POST /flutterwave/webhook`);
    });

    // 4. Schedule daily sales summary (every day at 9 PM WAT)
    cron.schedule(
      '0 21 * * *',
      async () => {
        try {
          console.log('[Cron] Sending daily summary...');

          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);

          const orderCount = await Order.countDocuments({
            created_at: { $gte: todayStart },
          });

          const paidCount = await Order.countDocuments({
            payment_status: 'paid',
            payment_date: { $gte: todayStart },
          });

          const pendingCount = await Order.countDocuments({
            payment_status: 'unpaid',
            created_at: { $gte: todayStart },
          });

          const revenueAgg = await Order.aggregate([
            { $match: { payment_status: 'paid', payment_date: { $gte: todayStart } } },
            { $group: { _id: null, total: { $sum: '$total_amount' } } },
          ]);

          const totalRevenue = revenueAgg.length > 0 ? revenueAgg[0].total : 0;

          await sendDailySummary({ orderCount, paidCount, pendingCount, totalRevenue });
        } catch (err) {
          console.error('[Cron] Daily summary error:', err);
        }
      },
      {
        timezone: 'Africa/Lagos',
      }
    );

    // 5. Schedule cleanup: delete unpaid orders older than 30 days (every day at 2 AM WAT)
    cron.schedule(
      '0 2 * * *',
      async () => {
        try {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - 30);

          console.log(`[Cron] Cleaning up unpaid orders older than ${cutoffDate.toISOString()}...`);

          // Find unpaid orders older than 30 days
          const oldUnpaidOrders = await Order.find({
            payment_status: 'unpaid',
            created_at: { $lt: cutoffDate },
          });

          if (oldUnpaidOrders.length === 0) {
            console.log('[Cron] No unpaid orders to clean up.');
            return;
          }

          const orderIds = oldUnpaidOrders.map((o) => o._id);
          const orderNumbers = oldUnpaidOrders.map((o) => o.order_number);

          // Delete related delivery details
          const deletedDeliveries = await DeliveryDetail.deleteMany({
            order_id: { $in: orderIds },
          });

          // Delete related payments (unlikely for unpaid, but just in case)
          const deletedPayments = await Payment.deleteMany({
            order_id: { $in: orderIds },
          });

          // Delete the orders
          const deletedOrders = await Order.deleteMany({
            _id: { $in: orderIds },
          });

          console.log(
            `[Cron] Cleanup complete:` +
            ` ${deletedOrders.deletedCount} orders,` +
            ` ${deletedDeliveries.deletedCount} delivery details,` +
            ` ${deletedPayments.deletedCount} payments deleted.`
          );
          console.log(`[Cron] Deleted order numbers: ${orderNumbers.join(', ')}`);
        } catch (err) {
          console.error('[Cron] Cleanup error:', err);
        }
      },
      {
        timezone: 'Africa/Lagos',
      }
    );

    // Graceful shutdown
    const shutdown = (signal) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      bot.stop(signal);
      mongoose.connection.close();
      process.exit(0);
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    console.error('❌ Failed to start application:', err);
    process.exit(1);
  }
}

start();
