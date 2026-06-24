const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Verify a Cloudflare Turnstile token server-side.
// When CF_TURNSTILE_SECRET is not configured (dev/test mode), verification is skipped.
// When it IS configured, failures are enforced — the prod path is not weakened.
export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  const secret = process.env.CF_TURNSTILE_SECRET || '';
  if (!secret) {
    console.warn('[turnstile] CF_TURNSTILE_SECRET not set — skipping verification (dev/test mode)');
    return true;
  }

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set('remoteip', ip);

    const res = await fetch(TURNSTILE_VERIFY_URL, { method: 'POST', body });
    if (!res.ok) return false;
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch (err) {
    console.error('[turnstile] verification error:', err);
    return false;
  }
}
