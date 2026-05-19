import fs from 'node:fs';
import path from 'node:path';
import { request as playwrightRequest } from '@playwright/test';
import { email, initialPassword } from './fixtures/auth';

const TRACK_FILE = path.resolve(process.cwd(), '.test-rooms.json');

export default async function globalTeardown(): Promise<void> {
  if (!fs.existsSync(TRACK_FILE)) return;
  let ids: string[] = [];
  try {
    ids = JSON.parse(fs.readFileSync(TRACK_FILE, 'utf8'));
  } catch {
    fs.unlinkSync(TRACK_FILE);
    return;
  }
  if (ids.length === 0) {
    fs.unlinkSync(TRACK_FILE);
    return;
  }
  const baseURL = process.env.E2E_BASE_URL || 'http://localhost:4700';
  const ctx = await playwrightRequest.newContext({ baseURL });
  try {
    const loginRes = await ctx.post('/api/login', { data: { email, password: initialPassword() } });
    if (!loginRes.ok()) {
      console.warn(`[global-teardown] login failed (${loginRes.status()}), leaving ${ids.length} rooms behind`);
      return;
    }
    const res = await ctx.post('/api/rooms/bulk-delete', { data: { ids } });
    if (res.ok()) {
      const body = await res.json();
      console.log(`[global-teardown] cleaned ${body.deleted ?? 0}/${ids.length} test rooms`);
    } else {
      console.warn(`[global-teardown] bulk-delete returned ${res.status()}`);
    }
  } finally {
    await ctx.dispose();
    try {
      fs.unlinkSync(TRACK_FILE);
    } catch {
      // ignore
    }
  }
}
