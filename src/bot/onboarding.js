/**
 * onboarding.js – Handles new user registration flow.
 *
 * Flow:  /start → Ask First Name → Ask Last Name → Ask Email → Save → Create Virtual Account → Show Menu
 *
 * All messages use HTML parse mode to avoid Markdown escaping issues.
 */
const { User } = require('../models');
const { ONBOARDING_STEPS } = require('../utils/constants');
const { isValidEmail, sanitize } = require('../utils/helpers');
const { createVirtualAccount } = require('../services/flutterwave');
const { mainMenuKeyboard } = require('./keyboards');

/**
 * Register all onboarding-related handlers on the bot.
 */
function registerOnboarding(bot) {
  // ─── /start command ───────────────────────────────────────────
  bot.start(async (ctx) => {
    try {
      const telegramId = ctx.from.id;

      // Check if user already exists
      const existingUser = await User.findOne({ telegram_id: telegramId });

      if (existingUser) {
        const businessName = process.env.BUSINESS_NAME || 'FreshPress Laundry';
        await ctx.reply(
          `👋 Welcome back, <b>${existingUser.first_name}</b>!\n\n` +
            `Great to see you again at <b>${businessName}</b> 🧺\n\n` +
            `What would you like to do today?`,
          { parse_mode: 'HTML', ...mainMenuKeyboard() }
        );
        return;
      }

      // New user – start onboarding
      const businessName = process.env.BUSINESS_NAME || 'FreshPress Laundry';

      await ctx.reply(
        `🎉 <b>Welcome to ${businessName}!</b>\n\n` +
          `We provide premium laundry services right at your fingertips ✨\n\n` +
          `Let's get you set up. This will only take a moment.\n\n` +
          `📝 <b>What is your first name?</b>`,
        { parse_mode: 'HTML' }
      );

      // Set session state
      ctx.session = ctx.session || {};
      ctx.session.step = ONBOARDING_STEPS.ASK_FIRST_NAME;
      ctx.session.onboarding = {};
    } catch (err) {
      console.error('[Onboarding] /start error:', err);
      await ctx.reply('❌ Something went wrong. Please try /start again.');
    }
  });
}

/**
 * Handle text messages during onboarding.
 * Returns true if the message was handled, false otherwise.
 */
async function handleOnboardingMessage(ctx) {
  if (!ctx.session || !ctx.session.step) return false;

  const step = ctx.session.step;
  const text = sanitize(ctx.message.text);

  // ─── First name ─────────────────────────────────────────────
  if (step === ONBOARDING_STEPS.ASK_FIRST_NAME) {
    if (!text || text.length < 2) {
      await ctx.reply('⚠️ Please enter a valid first name (at least 2 characters).');
      return true;
    }

    ctx.session.onboarding = ctx.session.onboarding || {};
    ctx.session.onboarding.firstName = text;
    ctx.session.step = ONBOARDING_STEPS.ASK_LAST_NAME;

    await ctx.reply(
      `Nice to meet you, <b>${text}</b>! 😊\n\n📝 <b>What is your last name?</b>`,
      { parse_mode: 'HTML' }
    );
    return true;
  }

  // ─── Last name ──────────────────────────────────────────────
  if (step === ONBOARDING_STEPS.ASK_LAST_NAME) {
    if (!text || text.length < 2) {
      await ctx.reply('⚠️ Please enter a valid last name (at least 2 characters).');
      return true;
    }

    ctx.session.onboarding.lastName = text;
    ctx.session.step = ONBOARDING_STEPS.ASK_EMAIL;

    await ctx.reply(
      `Great! <b>${ctx.session.onboarding.firstName} ${text}</b> ✅\n\n` +
        `📧 <b>Please enter your email address:</b>\n` +
        `<i>(This will be used for your payment account)</i>`,
      { parse_mode: 'HTML' }
    );
    return true;
  }

  // ─── Email ──────────────────────────────────────────────────
  if (step === ONBOARDING_STEPS.ASK_EMAIL) {
    if (!isValidEmail(text)) {
      await ctx.reply(
        '⚠️ That doesn\'t look like a valid email address.\n\n' +
          'Please enter a valid email (e.g. john@example.com):'
      );
      return true;
    }

    ctx.session.onboarding.email = text.toLowerCase().trim();

    // All info collected – save user
    await ctx.reply('⏳ Setting up your account...');

    try {
      const { firstName, lastName, email } = ctx.session.onboarding;
      const telegramId = ctx.from.id;
      const telegramUsername = ctx.from.username || null;

      // Save user to DB
      const user = await User.create({
        telegram_id: telegramId,
        telegram_username: telegramUsername,
        first_name: firstName,
        last_name: lastName,
        email: email,
      });

      // Create Flutterwave virtual account
      const txRef = `LDRY-USR-${telegramId}`;
      let virtualAccount = null;

      try {
        virtualAccount = await createVirtualAccount({
          email,
          firstName,
          lastName,
          txRef,
        });

        // Save virtual account info
        user.virtual_account = {
          account_number: virtualAccount.account_number,
          bank_name: virtualAccount.bank_name,
          account_reference: virtualAccount.account_reference,
          flutterwave_order_ref: virtualAccount.order_ref,
          flutterwave_flw_ref: virtualAccount.flw_ref,
        };
        await user.save();
      } catch (flwErr) {
        console.error('[Onboarding] Flutterwave account creation failed:', flwErr.message);
        // Continue without virtual account – can be retried later
      }

      // Clear onboarding session
      delete ctx.session.step;
      delete ctx.session.onboarding;

      // Send success message
      const businessName = process.env.BUSINESS_NAME || 'FreshPress Laundry';
      let message =
        `✅ <b>Account created successfully!</b>\n\n` +
        `Welcome to <b>${businessName}</b>, ${firstName}! 🎉\n\n`;

      if (virtualAccount) {
        message +=
          `💳 <b>Your Dedicated Payment Account:</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🏦 Bank: <b>${virtualAccount.bank_name}</b>\n` +
          `🔢 Account Number: <code>${virtualAccount.account_number}</code>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📌 <b>Important:</b> All future payments for your laundry orders\n` +
          `should be sent to this account number.\n\n`;
      } else {
        message +=
          `⚠️ We couldn't create your payment account right now.\n` +
          `Don't worry — you can still place orders and we'll sort it out!\n\n`;
      }

      message += `Ready to get started? Use the menu below! 👇`;

      await ctx.reply(message, { parse_mode: 'HTML', ...mainMenuKeyboard() });
    } catch (err) {
      console.error('[Onboarding] Save user error:', err);

      if (err.code === 11000) {
        delete ctx.session.step;
        delete ctx.session.onboarding;
        await ctx.reply(
          '✅ Looks like you already have an account!\n\nUse the menu below to continue.',
          mainMenuKeyboard()
        );
      } else {
        await ctx.reply('❌ Something went wrong creating your account. Please try /start again.');
      }
    }
    return true;
  }

  return false;
}

module.exports = { registerOnboarding, handleOnboardingMessage };
