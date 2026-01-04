const nodemailer = require('nodemailer');

function getEnv(name, fallback = '') {
  return process.env[name] ?? fallback;
}

function isEnabled() {
  return Boolean(getEnv('SMTP_HOST')) && Boolean(getEnv('SMTP_USER')) && Boolean(getEnv('SMTP_PASS'));
}

function getTransport() {
  const host = String(getEnv('SMTP_HOST')).trim();
  const port = Number(getEnv('SMTP_PORT', '465'));
  const secureRaw = String(getEnv('SMTP_SECURE', port === 465 ? 'true' : 'false')).toLowerCase();
  const secure = secureRaw === 'true' || secureRaw === '1' || secureRaw === 'yes';

  const user = String(getEnv('SMTP_USER')).trim();
  const pass = String(getEnv('SMTP_PASS'));

  const requireTlsRaw = String(getEnv('SMTP_REQUIRE_TLS', 'false')).toLowerCase();
  const requireTLS = requireTlsRaw === 'true' || requireTlsRaw === '1' || requireTlsRaw === 'yes';

  return nodemailer.createTransport({
    host,
    port: Number.isFinite(port) ? port : 465,
    secure,
    auth: { user, pass },
    ...(secure ? {} : { requireTLS }),
  });
}

async function sendMail({ to, subject, text, html }) {
  if (!isEnabled()) {
    const err = new Error('mail_not_configured');
    err.status = 500;
    throw err;
  }

  const from = String(getEnv('MAIL_FROM', getEnv('SMTP_USER'))).trim();
  const transport = getTransport();

  await transport.sendMail({
    from,
    to,
    subject,
    text,
    ...(html ? { html } : {}),
  });
}

module.exports = { sendMail, isEnabled };
