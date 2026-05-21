/**
 * Counter Model
 * Atomic auto-increment counter for generating sequential order numbers.
 */
const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. "order_number_2025"
  seq: { type: Number, default: 0 },
});

/**
 * getNextSequence – atomically increments and returns the next sequence value.
 * @param {string} name - counter identifier, e.g. "order_2025"
 */
counterSchema.statics.getNextSequence = async function (name) {
  const counter = await this.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
};

module.exports = mongoose.model('Counter', counterSchema);
