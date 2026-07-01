import assert from 'node:assert/strict';
import { isBuiltinBackgroundId, resolveBuiltinBackgroundUrl, resolveCamOffBackdropUrl } from './peer-state.js';

// R8b/R8c (deterministic, no MediaPipe/headless-media dependency): a REMOTE peer's custom/account
// background — carried as a broadcast thumbnail via `backgroundImageUrl`, populated from the new
// background-image WS relay — must resolve to that image, not fall through to initials. The param
// name is `localImageUrl` for historical reasons (R8a: it started as local-only) but the function
// itself has always been peer-agnostic; the R8b fix was removing the isLocal gate at the call site
// in tile.component.ts, not this resolver.

// S-1 — remote peer, custom/account image + broadcast thumbnail present -> resolves to the thumbnail.
{
  const url = resolveCamOffBackdropUrl({ kind: 'image', id: 'acct:custom-1' }, 'data:image/jpeg;base64,AAAA');
  assert.strictEqual(url, 'data:image/jpeg;base64,AAAA', 'a remote peer with a broadcast thumbnail resolves to that thumbnail, not null/initials');
}

// S-2 — remote peer, custom image but the thumbnail hasn't arrived yet -> null (renders initials),
// NOT the local-only special case this used to be gated behind.
{
  const url = resolveCamOffBackdropUrl({ kind: 'image', id: 'acct:custom-1' }, null);
  assert.strictEqual(url, null, 'no thumbnail yet -> null so the tile falls back to initials rather than showing a stale/wrong image');
}

// S-3 — remote peer, builtin image id, no thumbnail -> resolves via the public static asset,
// independent of any broadcast payload (this is the pre-existing, always-worked path).
{
  const url = resolveCamOffBackdropUrl({ kind: 'image', id: 'city' }, null);
  assert.strictEqual(url, '/assets/backgrounds/city.svg');
  assert.strictEqual(isBuiltinBackgroundId('city'), true);
}

// S-4 — a thumbnail takes priority over builtin resolution when both happen to be present
// (matches applyImageSelection's contract: builtins never populate a thumbnail, so in practice a
// non-null thumbnail always means "this is the real image to show").
{
  const url = resolveCamOffBackdropUrl({ kind: 'image', id: 'city' }, 'data:image/jpeg;base64,BBBB');
  assert.strictEqual(url, 'data:image/jpeg;base64,BBBB');
}

// S-5 — non-image kinds (none/blur) never resolve to a backdrop, regardless of a stale thumbnail
// lingering in peer state (this is exactly the staleness room.page.ts's incoming media-state
// handler guards against by clearing backgroundImage on such transitions).
{
  assert.strictEqual(resolveCamOffBackdropUrl({ kind: 'none' }, 'data:image/jpeg;base64,CCCC'), null);
  assert.strictEqual(resolveCamOffBackdropUrl({ kind: 'blur' }, 'data:image/jpeg;base64,CCCC'), null);
  assert.strictEqual(resolveCamOffBackdropUrl(undefined, 'data:image/jpeg;base64,CCCC'), null);
}

// S-6 — image kind with no id at all -> null.
{
  assert.strictEqual(resolveCamOffBackdropUrl({ kind: 'image' }, null), null);
}

assert.strictEqual(resolveBuiltinBackgroundUrl('not-a-builtin'), null, 'non-builtin ids never resolve to a static asset URL');

console.log('peer-state (R8b/R8c resolveCamOffBackdropUrl): all assertions passed');
