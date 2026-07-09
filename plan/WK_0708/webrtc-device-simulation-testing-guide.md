# WebRTC Device Simulation & Testing Guide for Cloudflare SFU Meeting App

**Context**: Building Google Meet/Zoom clone with Cloudflare SFU. Issues with dropped calls, audio problems on real devices (Android, iPhone, Linux, Mac, Windows). Server (Ubuntu) tests pass, but live fails. Good diagnostics/logs available.

Goal: Reproduce issues reliably in testing so agent can debug/fix using logs + WebRTC stats.

## 1. Local Simulation (Fast, On Ubuntu Servers)

### Browser & Device Emulation
- **Puppeteer/Playwright**: Spawn multiple browsers with device emulation (user-agent, viewport, metrics for iPhone/Android/etc.).
- **Media Device Emulator**: Use `@cloudflare/realtimekit-device-emulator` or Dyte's open-source version:
  - Add/remove virtual cams/mics.
  - Simulate failures, silence tracks, hardware changes.
- **MockRTC**: Mock peers, simulate errors, inspect traffic for automated tests.

### Multi-Client Tools
- **webrtcperf** (recommended): Spawns Puppeteer browsers, fake media, detailed RTC stats, network throttling. Linux-friendly.
  - Install: `npm install -g @vpalmisano/webrtcperf`
- Docker containers with varied browser images.
- VMs: VirtualBox/KVM for Windows/Linux variants.

### Mobile Emulators
- **Android**: Android Studio Emulator (fake/real inputs).
- **iOS**: Xcode Simulator (on Mac).
- Script with Appium/Playwright.

### Network Simulation (Key for Drops/Audio)
- **Linux `tc` + NetEm**: Simulate latency, jitter, packet loss, bandwidth limits.
  - Example: Throttle per-interface/IP.
- **ATC** (Augmented Traffic Control): Web UI wrapper.
- Integrate in webrtcperf.

**Setup Tip**: Run multi-participant calls with mixed profiles + throttling. Correlate with your diagnostics.

## 2. Cloud/Device Farm Testing (Real Devices)

- **BrowserStack, LambdaTest, Sauce Labs**: Real devices/browsers, WebRTC support, automation (Selenium/Appium), session recording, network simulation.
- Others: TestingBot, Mobitru.
- Use for manual exploration + automated regressions. Start with trials.

## 3. Diagnostics & Best Practices

- **Collect WebRTC Stats**: `getStats()` – RTP, ICE, candidates, codecs, jitter, loss, etc.
  - Chrome: `chrome://webrtc-internals`
  - Compare failing vs. working calls.
- **Common Issues**:
  - ICE/TURN reachability (test `turn.cloudflare.com`, UDP/TCP fallback).
  - Browser quirks (Safari/iOS codecs, background restrictions).
  - Simulcast for device variance.
  - Device permissions/enumeration.

- **Automation**: CI pipeline with varied configs + assertions on stats/logs.
- **Production**: Proactive monitoring of calls.

## Quick Start Recommendations
1. Install webrtcperf + device emulator + `tc` on test server.
2. Run mixed calls with network impairment.
3. Add Android emulator + real device.
4. Escalate to cloud farm for iOS/Safari.
5. Share specific logs/errors for targeted fixes.

**Resources**:
- webrtcperf GitHub
- Dyte Device Emulator
- MockRTC
- Linux TC docs

Discuss with agent: Prioritize local network + emulator setup first for quick wins. Let me know specific error patterns for deeper help!