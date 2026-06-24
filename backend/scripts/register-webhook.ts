/**
 * Registers the Telegram bot webhook with TG_WEBHOOK_SECRET.
 * Run once after deploying a new secret or changing the PUBLIC_URL:
 *
 *   npm run register-webhook
 *
 * Required env vars: TG_APP_TOKEN, PUBLIC_URL
 * Optional env var:  TG_WEBHOOK_SECRET (strongly recommended in production)
 */
import 'dotenv/config';

async function main(): Promise<void> {
  const token = process.env.TG_APP_TOKEN || '';
  const secret = process.env.TG_WEBHOOK_SECRET || '';
  const publicUrl = (process.env.PUBLIC_URL || '').replace(/\/$/, '');

  if (!token) {
    console.error('ERROR: TG_APP_TOKEN is not set');
    process.exit(1);
  }
  if (!publicUrl) {
    console.error('ERROR: PUBLIC_URL is not set');
    process.exit(1);
  }
  if (!secret) {
    console.warn('WARNING: TG_WEBHOOK_SECRET is not set — webhook will be unauthenticated');
  }

  const webhookUrl = `${publicUrl}/api/telegram/webhook`;
  console.log(`Registering webhook: ${webhookUrl}`);

  const body: Record<string, unknown> = {
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false,
  };
  if (secret) body.secret_token = secret;

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as { ok: boolean; description?: string };
  if (data.ok) {
    console.log('✅ Webhook registered successfully');
    if (secret) console.log('   Secret token: configured');
    console.log('   allowed_updates: message, callback_query');
  } else {
    console.error('❌ setWebhook failed:', data.description);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
