function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function splitEmails(raw) {
  return String(raw || '')
    .split(/[\s,;]+/)
    .map((v) => normalizeEmail(v))
    .filter(Boolean);
}

function getConfiguredSuperAdminEmails() {
  const result = new Set();

  const multi = splitEmails(process.env.SUPERADMIN_EMAILS);
  for (const email of multi) result.add(email);

  const singleCandidates = [
    process.env.SUPERADMIN_EMAIL,
    process.env.MAIN_ADMIN_EMAIL,
    process.env.BOOTSTRAP_ADMIN_EMAIL,
    process.env.ADMIN_EMAIL,
  ];
  for (const candidate of singleCandidates) {
    const email = normalizeEmail(candidate);
    if (email) result.add(email);
  }

  return result;
}

function isSuperAdminEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const configured = getConfiguredSuperAdminEmails();
  return configured.has(normalized);
}

module.exports = { isSuperAdminEmail, getConfiguredSuperAdminEmails };
