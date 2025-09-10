// Email Helper: categorized sending with flags, suppression, and event tracking
// Usage: const helper = require('./emailHelper')(transporter, () => mongoDb)

module.exports = function createEmailHelper(transporter, getMongoDb) {
  function getFlags() {
    return {
      contact: process.env.EMAIL_ENABLE_CONTACT !== 'false',
      newsletter_welcome: process.env.EMAIL_ENABLE_NEWSLETTER_WELCOME !== 'false',
      content_digest: process.env.EMAIL_ENABLE_CONTENT_DIGEST !== 'false',
      content_digest_products: process.env.EMAIL_ENABLE_CONTENT_DIGEST_PRODUCTS !== 'false',
      content_digest_solutions: process.env.EMAIL_ENABLE_CONTENT_DIGEST_SOLUTIONS !== 'false',
      announcement: process.env.EMAIL_ENABLE_ANNOUNCEMENT !== 'false',
      marketing: process.env.EMAIL_ENABLE_MARKETING !== 'false',
    };
  }

  function isEmailCategoryEnabled(category) {
    const flags = getFlags();
    return !!flags[category];
  }

  async function isSuppressed(email, category) {
    try {
      const db = typeof getMongoDb === 'function' ? getMongoDb() : null;
      if (!db) return false;
      const doc = await db.collection('email_suppressions').findOne({
        email: String(email || '').toLowerCase(),
        category,
        suppressed: true,
      });
      return !!doc;
    } catch (_) {
      return false;
    }
  }

  async function ensureIndexes() {
    try {
      const db = typeof getMongoDb === 'function' ? getMongoDb() : null;
      if (!db) return;
      await db.collection('email_events').createIndex({ dedupeKey: 1 }, { sparse: true });
      await db.collection('email_events').createIndex({ createdAt: -1 });
    } catch (_) {}
  }

  async function sendCategorizedEmail({ category, to, subject, html, text, meta = {}, dedupeKey, headers = {} }) {
    // Flags
    if (!isEmailCategoryEnabled(category)) {
      return { skipped: true, reason: 'disabled' };
    }

    // Suppressions
    if (await isSuppressed(to, category)) {
      return { skipped: true, reason: 'suppressed' };
    }

    const db = typeof getMongoDb === 'function' ? getMongoDb() : null;

    // Dedupe (optional)
    if (dedupeKey && db) {
      try {
        // Only treat as duplicate if a previous SEND succeeded
        const exists = await db.collection('email_events').findOne({ dedupeKey, result: 'sent' });
        if (exists) return { skipped: true, reason: 'duplicate' };
      } catch (_) { /* ignore DB errors on dedupe when disconnected */ }
    }

    await ensureIndexes();

    try {
      // Build compliant headers for Gmail "Manage subscriptions" and RFC 8058 one-click unsubscribe
      const isBulk = ['newsletter_welcome', 'content_digest', 'content_digest_products', 'content_digest_solutions', 'announcement'].includes(category);
      const fromEmail = process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER || 'updates@vayaccess.com';
      const fromName = process.env.EMAIL_FROM_NAME || 'VayAccess';
      const sendingDomain = (fromEmail.split('@')[1] || 'vayaccess.com');
      const unsubscribeMailto = process.env.LIST_UNSUBSCRIBE_MAILTO || `mailto:unsubscribe@${sendingDomain}`;
      const unsubscribeUrl = process.env.LIST_UNSUBSCRIBE_URL || `https://${sendingDomain}/unsubscribe`;
      const listUnsubscribe = `<${unsubscribeMailto}>, <${unsubscribeUrl}>`;
      const listIdName = process.env.LIST_ID_NAME || 'VayAccess Newsletter';
      const listIdDomain = process.env.LIST_ID_DOMAIN || `newsletter.${sendingDomain}`;
      const listId = `${listIdName} <${listIdDomain}>`;

      const finalHeaders = {
        ...(isBulk
          ? {
              'List-Unsubscribe': listUnsubscribe,
              // Enables one-click unsubscribe in Gmail per RFC 8058
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              // Helps Gmail group messages as a subscription/list (header field-names are case-insensitive)
              'List-Id': listId,
              // Mark as bulk to hint non-transactional traffic
              'Precedence': 'bulk',
              // Optional: Google feedback identifier format (service:domain:site)
              'Feedback-ID': process.env.FEEDBACK_ID || `newsletter:${sendingDomain}:vayaccess`,
            }
          : {}),
        // Allow caller-provided headers (e.g., tokenized one-click URL) to override defaults
        ...(headers || {}),
      };

      const info = await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to,
        subject,
        html,
        text,
        headers: finalHeaders,
      });

      if (db) {
        try {
          await db.collection('email_events').insertOne({
            category,
            to: String(to || '').toLowerCase(),
            subject,
            meta,
            dedupeKey: dedupeKey || null,
            createdAt: new Date(),
            result: 'sent',
          });
        } catch (_) { /* ignore DB errors when disconnected */ }
      }

      return { success: true, info };
    } catch (e) {
      if (db) {
        try {
          await db.collection('email_events').insertOne({
            category,
            to: String(to || '').toLowerCase(),
            subject,
            meta,
            dedupeKey: dedupeKey || null,
            createdAt: new Date(),
            result: 'failed',
            error: e?.message || String(e),
          });
        } catch (_) { /* ignore DB errors when disconnected */ }
      }
      return { success: false, error: e?.message || String(e) };
    }
  }

  return { getFlags, isEmailCategoryEnabled, isSuppressed, sendCategorizedEmail };
}