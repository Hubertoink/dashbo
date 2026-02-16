/**
 * Centralised HTML email templates for DashbO.
 *
 * Every template returns { subject, text, html } ready for sendMail().
 * The plain-text `text` is always included as a fallback.
 */

// Inline SVG logo encoded as a data-URI so it works without external hosting.
const LOGO_DATA_URI =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">` +
      `<rect width="512" height="512" rx="96" fill="#1a1a2e"/>` +
      `<circle cx="160" cy="196" r="44" fill="#fff" opacity="0.85"/>` +
      `<rect x="124" y="250" width="264" height="40" rx="20" fill="#fff" opacity="0.85"/>` +
      `<rect x="124" y="320" width="200" height="40" rx="20" fill="#fff" opacity="0.65"/>` +
      `</svg>`
  ).toString('base64');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Wraps body HTML in a responsive, dark-themed email shell.
 */
function wrapLayout(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="color-scheme" content="dark light"/>
  <title>DashbO</title>
</head>
<body style="margin:0;padding:0;background:#111827;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e5e7eb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111827;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#1f2937;border-radius:16px;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="padding:32px 32px 16px;text-align:center;">
            <img src="${LOGO_DATA_URI}" alt="DashbO" width="56" height="56" style="display:inline-block;border-radius:12px;"/>
            <div style="margin-top:12px;font-size:22px;font-weight:700;color:#f9fafb;letter-spacing:0.3px;">DashbO</div>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:8px 32px 32px;">
            ${bodyHtml}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.08);text-align:center;">
            <div style="font-size:11px;color:#6b7280;">
              Diese E-Mail wurde automatisch von DashbO gesendet.
            </div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function ctaButton(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
    <tr><td style="border-radius:10px;background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);" align="center">
      <a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
        ${escapeHtml(label)}
      </a>
    </td></tr>
  </table>`;
}

function paragraph(text, extra = '') {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#d1d5db;${extra}">${text}</p>`;
}

function smallMuted(text) {
  return `<p style="margin:16px 0 0;font-size:12px;color:#6b7280;line-height:1.5;">${text}</p>`;
}

// ─── Public template builders ────────────────────────────────────

function inviteEmail({ link }) {
  const subject = 'Einladung zu DashbO';
  const text =
    `Du wurdest zu einem DashbO Kalender eingeladen.\n\n` +
    `Link zum Annehmen der Einladung: ${link}\n\n` +
    `Wenn du das nicht warst, kannst du diese Mail ignorieren.`;

  const html = wrapLayout(
    paragraph('Du wurdest zu einem <strong style="color:#f9fafb;">DashbO Familienkalender</strong> eingeladen! 🎉') +
    paragraph('Klicke auf den Button, um die Einladung anzunehmen und dein Konto einzurichten.') +
    ctaButton(link, 'Einladung annehmen') +
    smallMuted('Oder kopiere diesen Link in deinen Browser:') +
    `<p style="margin:6px 0 0;font-size:12px;color:#818cf8;word-break:break-all;">${escapeHtml(link)}</p>` +
    smallMuted('Wenn du diese Einladung nicht erwartet hast, kannst du diese E-Mail einfach ignorieren.')
  );

  return { subject, text, html };
}

function passwordResetEmail({ link }) {
  const subject = 'Passwort zurücksetzen – DashbO';
  const text =
    `Du hast ein neues Passwort für DashbO angefordert.\n\n` +
    `Link zum Zurücksetzen: ${link}\n\n` +
    `Wenn du das nicht warst, kannst du diese Mail ignorieren.`;

  const html = wrapLayout(
    paragraph('Du hast ein neues Passwort für <strong style="color:#f9fafb;">DashbO</strong> angefordert.') +
    paragraph('Klicke auf den Button, um dein Passwort jetzt zurückzusetzen. Der Link ist 1 Stunde gültig.') +
    ctaButton(link, 'Passwort zurücksetzen') +
    smallMuted('Oder kopiere diesen Link in deinen Browser:') +
    `<p style="margin:6px 0 0;font-size:12px;color:#818cf8;word-break:break-all;">${escapeHtml(link)}</p>` +
    smallMuted('Wenn du diese Anfrage nicht gestellt hast, kannst du diese E-Mail einfach ignorieren – dein Passwort bleibt unverändert.')
  );

  return { subject, text, html };
}

function emailVerificationEmail({ link }) {
  const subject = 'E-Mail bestätigen – DashbO';
  const text =
    `Bitte bestätige deine E-Mail-Adresse für DashbO.\n\n` +
    `Link: ${link}\n\n` +
    `Wenn du das nicht warst, kannst du diese Mail ignorieren.`;

  const html = wrapLayout(
    paragraph('Bitte bestätige deine E-Mail-Adresse für <strong style="color:#f9fafb;">DashbO</strong>.') +
    paragraph('Klicke auf den Button, um deine E-Mail zu verifizieren.') +
    ctaButton(link, 'E-Mail bestätigen') +
    smallMuted('Oder kopiere diesen Link in deinen Browser:') +
    `<p style="margin:6px 0 0;font-size:12px;color:#818cf8;word-break:break-all;">${escapeHtml(link)}</p>` +
    smallMuted('Wenn du das nicht warst, kannst du diese E-Mail einfach ignorieren.')
  );

  return { subject, text, html };
}

module.exports = { inviteEmail, passwordResetEmail, emailVerificationEmail };
