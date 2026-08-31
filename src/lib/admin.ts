export function isAdminEmail(email: string, configured: string | undefined): boolean {
  if (!configured) return false;
  const normalized = email.trim().toLowerCase();
  return configured.split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean).includes(normalized);
}
