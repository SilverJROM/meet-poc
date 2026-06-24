import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function pythonCommand(): string {
  for (const candidate of ['python3', 'python']) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'pipe' });
      return candidate;
    } catch {
      /* try next candidate */
    }
  }
  throw new Error('No python3 or python executable available for transcribe.py guard');
}

describe('transcribe.py python regression guard', () => {
  it('runs the owner-labeling, mixed-skip, and versioned-sidecar guard under npm test', () => {
    const python = pythonCommand();
    expect(() => {
      execFileSync(python, ['scripts/test_owner_labeling.py', '-v'], {
        cwd: new URL('..', import.meta.url),
        stdio: 'pipe',
      });
    }).not.toThrow();
  });
});
