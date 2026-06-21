# CR5 Red-Team: Multi-guest / Reconnect / Gate-Bypass / Host-as-User (haiku)

## Multi-guest state keying (prevInboundBytes / peerFirstSeen collision?)
- **Thread 1: Cross-peer bytes bleed**
  - Each peer gets peer.id (unique)
  - prevInboundBytes keyed by peer.id → inboundByClientId rebuilt every poll (line 2992-2993)
  - peerFirstSeen keyed by peer.id → pruned on departure (line 2989-2991), reset on rejoin (line 2972)
  - **SAFE**: No collision, each peer isolated. ✓

- **Thread 2: Three-guest scenario (A stalled, B healthy, C never-published)**
  - A: isPublishing=true, bytesNow=0, bytesPrev=0, micEnabled=true, pastGrace=true → classifyPeerAudioHealth returns 'stalled' → badged ✓
  - B: bytes climbing → 'ok' → not badged ✓
  - C: isPublishing=false, pastGrace=true, micEnabled=true → 'never-published' → badged ✓
  - Host sees correct badges for each. **SAFE**. ✓

## Reconnect / Rejoin scenarios
- **Thread 1: Guest leaves during grace, rejoins within same 15s poll window**
  - Guest leaves → pruned from this.peers() → peerFirstSeen.delete(clientId) at line 2990
  - Guest rejoins → added to this.peers() → peerFirstSeen.set(clientId, now) at line 2972
  - Grace window **RESTARTS** (new firstSeen = now) → no false stall badge ✓
  - **SAFE**. ✓

- **Thread 2: Guest was publishing, stops publishing (no track), then rejoin-publishes**
  - Poll 1 (publishing): inboundByClientId={guestId: 1000}, bytesPrev=null, evaluation happens, then prevInboundBytes={guestId: 1000}
  - Poll 2 (stopped): inboundByClientId={}, guestId not in inboundByClientId, but guestId still in this.peers()
    - bytesPrev = prevInboundBytes.get(guestId) = 1000 (old value from poll 1)
    - bytesNow = inboundByClientId.get(guestId) ?? null = null
    - hasTrack = false → classifyPeerAudioHealth: 'no-track' (line 620) → badged as 'no-track'
  - Poll 3 (re-publishing): inboundByClientId={guestId: 100}, bytesPrev=null (not in prev because they were 'no-track', so didn't get added back)
    - First sample after rejoin has bytesPrev=null → classifyPeerAudioHealth skips stalled check, returns 'ok'
    - Grace period protection also kicks in (peerFirstSeen was preserved across no-track window)
  - **SAFE**: No false stall on rejoin. ✓

- **Thread 3: Host WS disconnect/reconnect mid-call**
  - Host already in-call, already published (localPublishState.status='published')
  - WS reconnects → handleAdmit fires (line 1934)
  - publishInitialSfuWithRetry is called BUT line 1662: `if (...localPublishState?.status === 'published') return;`
  - Early return → no re-gate, no double audio-connecting ✓
  - **SAFE**. ✓

## Adversarial gate-bypass attacks
- **Attack 1: Can user join by clicking "Confirm" even if speaker test failed?**
  - onPreflightConfirm requires preflightConfirmReady() = true (line 820)
  - preflightConfirmReady = computed(() => this.micWorking() && this.speakerVerified()) (line 785)
  - speakerVerified is ONLY true after confirmSpeakerHeard() (line 901), never auto-set
  - If test fails (catch at line 894), speakerVerified stays false, confirm button stays disabled ✓
  - **SAFE**. ✓

- **Attack 2: Double-click "Confirm" to bypass?**
  - join() checks `if (this.state() === 'connecting') return;` at line 858
  - State set to 'connecting' before any async work
  - Second click during first join → returns early ✓
  - **SAFE**. ✓

- **Attack 3: Mic unplugged 500ms before join click**
  - hasMicAccess() at line 2444: checks `audioTrack.readyState === 'live'`
  - If track ended, readyState='ended' → hasMicAccess()=false
  - BUT: polling interval (MIC_SILENCE_WATCHDOG_POLL_MS) is 1s (line 746)
  - ~500ms window exists where mic is dead but micWorking=true (from last poll)
  - User joins → publishInitialSfuWithRetry fires → initialPublishStream() called
  - initialPublishStream checks live tracks at line 1849: if (!stream?.getAudioTracks().some((t) => t.readyState !== 'ended')) throw new InitialPublishPermanentError (line 1851-1854)
  - **THROWS LOUDLY** → finally block catches, sets audio-failed (line 1749) → host sees notice ✓
  - **SAFE**. ✓

- **Attack 4: Refresh mid-gate (audio-connecting state)**
  - Page reload triggers ngOnDestroy → cleanupCall (line 1652)
  - cleanupCall resets preflightGateStatus='pending' (line 2633)
  - User is back in lobby, must re-test speaker/mic
  - **SAFE**. ✓

- **Attack 5: Programmatic preflightGateStatus.set('ready') via console**
  - missingJoinPrereqs() reads micWorking() and speakerVerified() (line 1437)
  - NOT preflightGateStatus
  - So console.log hack doesn't bypass actual gate signals ✓
  - **SAFE**. ✓

## Host-is-also-a-user gate enforcement
- **Thread 1: Host must pass their own gate**
  - missingJoinPrereqs() at line 2433 applies to EVERYONE (no host check)
  - Calls missingPreflightPrereqs({ hasMicAccess, micVerified, speakerTested }) for host too (line 2437-2441)
  - Host must have micWorking=true AND speakerVerified=true (line 785)
  - No bypass logic for host ✓
  - **SAFE**. ✓

- **Thread 2: Host's own audio-failed is surfaced**
  - Host publishes → audio-failed triggers (any path: retries exhausted, transceiver check fails, state-revert, timeout)
  - shouldShowAudioFailNotice({ isHost: true }) → true (line 631)
  - Host sees initialPublishFailureNotice (line 1720, 1752, etc.)
  - shouldOpenDeviceDialogOnAudioFail({ isHost: true }) → true (line 627)
  - Host's device dialog auto-opens (line 1723, 1755, etc.)
  - **NOT SILENT** ✓
  - **SAFE**. ✓

## R10 end-to-end tracing (two failure modes through real code)

### Failure Mode 1: Remote audio stalled (R10(a) bytes frozen at 0)
```
TRACE:
  updateRemoteAudioHealth() called every 15s (line 2943)
  → inboundAudio = current RTC inbound tracks
  → inboundByClientId.set(publisherClientId, bytesReceived) [line 2960]
  → For each peer in this.peers():
      bytesPrev = prevInboundBytes.get(clientId) [line 2977] (from last poll)
      bytesNow = inboundByClientId.get(clientId) [line 2976]
      input = { isPublishing: true, hasTrack: true, bytesReceivedNow: 0, bytesReceivedPrev: 0, micEnabled: true, pastGrace: true }
      decision = classifyPeerAudioHealth(input) [line 2986]
        → input.bytesReceivedPrev !== null && input.bytesReceivedNow <= input.bytesReceivedPrev → 'stalled' [line 621]
      if (decision !== 'ok') unhealthy.add(clientId) [line 2986]
  → remoteAudioUnhealthyIds.set(unhealthy) [line 2994]
  → In tile template: [audioUnhealthy]="isHost() && peerAudioUnhealthyIds().has(peer.id)" [room.page.html line 676]
  → UI renders: <span class="audio-health-badge">No audio</span> [line 141]

VERIFIED**: Path is LOUD and END-TO-END. ✓
```

### Failure Mode 2: Publish never triggered (R10(c) PATH A — hasPc=false)
```
TRACE:
  User clicks join → join() [line 857]
  → WS.connect() called [line 898]
  → Server sends admit message
  → handleAdmit() fires [line 1934]
  → publishInitialSfuWithRetry(participantId, sessionId) called [line 1936]
    → this.publishTriggerCount += 1 [line 1660] (PATH A detector)
    → if (this.state() !== 'in-call' || already published) return early [line 1662]
    → this.preflightGateStatus.set('audio-connecting') [line 1664]
    → Try publish loop [line 1674-1737]
      IF hasPc=false: publishSfuOnceAfterAdmit() throws [line 1677]
        → Caught at line 1702
        → planInitialPublishRetry() suggests no-retry [line 1704]
        → Set preflightGateStatus='audio-failed' [line 1718] **NOT SILENT**
        → Show notice if host [line 1719-1721]
        → Open device dialog if host [line 1723]
    → Finally block [line 1738-1759]
      → Even if caught above, finally fires
      → shouldSurfacePublishFailure check [line 1749] prevents double-set
  → Diagnostics log: publishTriggerCount logged [line 1246, line 811]

VERIFIED**: PATH A is LOUD (gate set to 'audio-failed' at line 1718 before any return). ✓
       Regression: If PATH A somehow doesn't fire, publishTriggerCount would be 0, and the
       diagnostic would flag it. ✓
```

## Remaining questions / edge cases checked

1. **Cleanup on leave**: peerFirstSeen and prevInboundBytes cleared at lines 2692-2693 ✓
2. **Audio-connecting timeout**: 15s hardcoded (line 1635), if still connecting, marked audio-failed ✓
3. **State-revert guard (CR-FIX-1)**: shouldSurfacePublishFailure at line 1749 catches any exit without success ✓
4. **Multiple concurrent publishes**: runId guard prevents timeout/finally from older run interfering (line 1741) ✓
5. **Guest never-published during grace**: Intentional (subscription setup window, grace period restarts on rejoin) ✓
6. **Lobby self-test polling vs gate**: Both use classifyMicCapture but different reducers (warning vs working signal) — safe ✓

## Findings
**[NONE]** — No critical gate-bypass vectors found. Multi-guest state is isolated, reconnect/rejoin resets grace period correctly, host passes their own gate, all publish failures are surfaced loudly (never silent).

## Verdict
**STATUS: CRITICAL-CLEAN** ✓

All R10 failure modes reach 'audio-failed' loudly. No silent in-call unpublished peers. Multi-guest badges show correct peer per unique ID. Host-as-user gate enforced. Reconnect/rejoin lifecycle is correct.
