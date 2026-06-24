import crypto from 'node:crypto';

export function generateChallengeToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export function hashChallengeToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// Returns { display, buttons } — display is always present in buttons, position is random.
export function buildNumberMatchSet(): { display: number; buttons: number[] } {
  const display = 10 + Math.floor(Math.random() * 90); // 10–99

  const decoys: number[] = [];
  while (decoys.length < 2) {
    const n = 10 + Math.floor(Math.random() * 90);
    if (n !== display && !decoys.includes(n)) decoys.push(n);
  }

  // Fisher-Yates shuffle of [display, decoy1, decoy2]
  const arr = [display, decoys[0], decoys[1]];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }

  return { display, buttons: arr };
}
