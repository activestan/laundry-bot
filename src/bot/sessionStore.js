/**
 * sessionStore.js – MongoDB-backed session store for Telegraf.
 *
 * Why: In-memory sessions are lost when the server restarts.
 * With 100+ daily users, someone is always mid-conversation.
 * This persists session state to MongoDB so conversations survive restarts.
 */
const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
  }
);

// Auto-expire sessions after 24 hours of inactivity (cleanup)
sessionSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 86400 });

const SessionModel = mongoose.model('Session', sessionSchema);

/**
 * Creates a Telegraf-compatible session store backed by MongoDB.
 *
 * Usage:
 *   const { session } = require('telegraf');
 *   bot.use(session({ store: createMongoStore() }));
 */
function createMongoStore() {
  return {
    async get(key) {
      try {
        const doc = await SessionModel.findOne({ key });
        return doc ? doc.data : undefined;
      } catch (err) {
        console.error('[Session] get error:', err.message);
        return undefined;
      }
    },

    async set(key, data) {
      try {
        await SessionModel.findOneAndUpdate(
          { key },
          { key, data },
          { upsert: true, new: true }
        );
      } catch (err) {
        console.error('[Session] set error:', err.message);
      }
    },

    async delete(key) {
      try {
        await SessionModel.deleteOne({ key });
      } catch (err) {
        console.error('[Session] delete error:', err.message);
      }
    },
  };
}

module.exports = { createMongoStore };
