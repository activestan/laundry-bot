/**
 * receipt.js – Receipt generation service.
 *
 * Builds an HTML-formatted receipt for Telegram and also
 * generates a PDF receipt with an embedded QR code.
 *
 * All Telegram messages use HTML parse mode for reliability.
 */
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { formatNaira, formatDate } = require('../utils/helpers');

/**
 * Build a nicely formatted HTML receipt string for Telegram.
 */
function buildMarkdownReceipt({ order, user, deliveryDetail }) {
  const businessName = process.env.BUSINESS_NAME || 'FreshPress Laundry';
  const lines = [];

  lines.push(`🧾 <b>${businessName} — RECEIPT</b>`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`📄 <b>Receipt ID:</b> <code>${order.receipt_id}</code>`);
  lines.push(`🔢 <b>Order Number:</b> <code>${order.order_number}</code>`);
  lines.push(`📅 <b>Date:</b> ${formatDate(order.payment_date || order.created_at)}`);
  lines.push('');
  lines.push(`👤 <b>Customer:</b> ${user.first_name} ${user.last_name}`);
  if (user.telegram_username) {
    lines.push(`💬 <b>Telegram:</b> @${user.telegram_username}`);
  }
  lines.push(`📧 <b>Email:</b> ${user.email}`);
  lines.push('');
  lines.push('🧺 <b>ORDER ITEMS</b>');
  lines.push('─────────────────────────');

  for (const item of order.items) {
    lines.push(`  ${item.quantity}x ${item.name}  —  ${formatNaira(item.line_total)}`);
  }

  lines.push('─────────────────────────');
  lines.push(`  <b>Subtotal:</b>  ${formatNaira(order.subtotal)}`);

  if (order.delivery_type === 'pickup') {
    lines.push(`  🚚 <b>Pickup Delivery:</b>  ${formatNaira(order.delivery_fee)}`);
  } else {
    lines.push(`  🏃 <b>Self Delivery:</b>  FREE`);
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`  💰 <b>TOTAL PAID:</b>  ${formatNaira(order.total_amount)}`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`  ✅ <b>Payment Status:</b>  PAID`);
  lines.push('');

  if (order.delivery_type === 'pickup' && deliveryDetail) {
    lines.push('📍 <b>PICKUP DETAILS</b>');
    lines.push(`  🏠 Lodge: ${deliveryDetail.lodge_name}`);
    lines.push(`  📫 Address: ${deliveryDetail.lodge_address}`);
    lines.push(`  🗺️ Landmark: ${deliveryDetail.landmark}`);
    lines.push(`  📞 Phone: ${deliveryDetail.phone_number}`);
    lines.push('');
  }

  lines.push(`<i>Thank you for choosing ${businessName}!</i>`);

  return lines.join('\n');
}

/**
 * Build a worker/admin notification message.
 */
function buildWorkerNotification({ order, user, deliveryDetail }) {
  const lines = [];

  lines.push('🔔 <b>NEW PAID ORDER</b>');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`🔢 <b>Order:</b> <code>${order.order_number}</code>`);
  lines.push(`📅 <b>Date:</b> ${formatDate(order.payment_date || new Date())}`);
  lines.push('');
  lines.push(`👤 <b>Customer:</b> ${user.first_name} ${user.last_name}`);
  if (user.telegram_username) lines.push(`💬 @${user.telegram_username}`);
  lines.push(`📧 ${user.email}`);
  lines.push('');
  lines.push('🧺 <b>Items:</b>');
  for (const item of order.items) {
    lines.push(`  ${item.quantity}x ${item.name}  — ${formatNaira(item.line_total)}`);
  }
  lines.push('');
  lines.push(`💰 <b>Total:</b> ${formatNaira(order.total_amount)}`);
  lines.push('');

  if (order.delivery_type === 'pickup') {
    lines.push('🚨🚨 <b>PICKUP REQUIRED</b> 🚨🚨');
    if (deliveryDetail) {
      lines.push(`  🏠 Lodge: ${deliveryDetail.lodge_name}`);
      lines.push(`  📫 Address: ${deliveryDetail.lodge_address}`);
      lines.push(`  🗺️ Landmark: ${deliveryDetail.landmark}`);
      lines.push(`  📞 Phone: ${deliveryDetail.phone_number}`);
    }
  } else {
    lines.push('🏃 <b>Self Delivery</b> – Customer will drop off &amp; pick up');
  }

  return lines.join('\n');
}

/**
 * Generate a PDF receipt buffer with QR code.
 *
 * @returns {Promise<Buffer>}
 */
async function generatePDFReceipt({ order, user, deliveryDetail }) {
  const businessName = process.env.BUSINESS_NAME || 'FreshPress Laundry';

  // Generate QR code as data URL (contains order number for tracking)
  const qrData = JSON.stringify({
    order: order.order_number,
    receipt: order.receipt_id,
    amount: order.total_amount,
  });
  const qrDataUrl = await QRCode.toDataURL(qrData, { width: 120, margin: 1 });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(22).font('Helvetica-Bold').text(businessName, { align: 'center' });
    doc.fontSize(12).font('Helvetica').text('OFFICIAL RECEIPT', { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    // Receipt meta
    doc.fontSize(10).font('Helvetica');
    doc.text(`Receipt ID: ${order.receipt_id}`);
    doc.text(`Order Number: ${order.order_number}`);
    doc.text(`Date: ${formatDate(order.payment_date || order.created_at)}`);
    doc.moveDown(0.5);

    // Customer info
    doc.font('Helvetica-Bold').text('Customer Details');
    doc.font('Helvetica');
    doc.text(`Name: ${user.first_name} ${user.last_name}`);
    doc.text(`Email: ${user.email}`);
    if (user.telegram_username) doc.text(`Telegram: @${user.telegram_username}`);
    doc.moveDown(0.5);

    // Table header
    doc.font('Helvetica-Bold');
    const tableTop = doc.y;
    doc.text('Item', 50, tableTop, { width: 200 });
    doc.text('Qty', 260, tableTop, { width: 60, align: 'center' });
    doc.text('Price', 330, tableTop, { width: 100, align: 'right' });
    doc.text('Total', 440, tableTop, { width: 100, align: 'right' });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.3);

    // Table rows
    doc.font('Helvetica');
    for (const item of order.items) {
      const y = doc.y;
      doc.text(item.name, 50, y, { width: 200 });
      doc.text(String(item.quantity), 260, y, { width: 60, align: 'center' });
      doc.text(formatNaira(item.unit_price), 330, y, { width: 100, align: 'right' });
      doc.text(formatNaira(item.line_total), 440, y, { width: 100, align: 'right' });
      doc.moveDown(0.3);
    }

    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    // Totals
    doc.font('Helvetica');
    doc.text(`Subtotal: ${formatNaira(order.subtotal)}`, { align: 'right' });
    const deliveryLabel =
      order.delivery_type === 'pickup'
        ? `Pickup Delivery: ${formatNaira(order.delivery_fee)}`
        : 'Self Delivery: FREE';
    doc.text(deliveryLabel, { align: 'right' });
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(14);
    doc.text(`TOTAL PAID: ${formatNaira(order.total_amount)}`, { align: 'right' });
    doc.moveDown(0.5);

    doc.fontSize(10).font('Helvetica');
    doc.text('Payment Status: PAID ✓', { align: 'right' });
    doc.moveDown(1);

    // Pickup details
    if (order.delivery_type === 'pickup' && deliveryDetail) {
      doc.font('Helvetica-Bold').text('Pickup Details');
      doc.font('Helvetica');
      doc.text(`Lodge: ${deliveryDetail.lodge_name}`);
      doc.text(`Address: ${deliveryDetail.lodge_address}`);
      doc.text(`Landmark: ${deliveryDetail.landmark}`);
      doc.text(`Phone: ${deliveryDetail.phone_number}`);
      doc.moveDown(1);
    }

    // QR Code
    const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
    doc.image(qrBuffer, doc.page.width / 2 - 60, doc.y, { width: 120, height: 120 });
    doc.moveDown(8);
    doc.fontSize(8).text('Scan QR code for order details', { align: 'center' });

    // Footer
    doc.moveDown(1);
    doc.fontSize(8).text(`Thank you for choosing ${businessName}!`, { align: 'center' });

    doc.end();
  });
}

module.exports = {
  buildMarkdownReceipt,
  buildWorkerNotification,
  generatePDFReceipt,
};
