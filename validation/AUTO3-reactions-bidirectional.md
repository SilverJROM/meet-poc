# AUTO3 reactions bidirectional validation

## Diagnosis

- Added a focused 2-browser Playwright spec covering host -> guest and guest -> host smiley reactions.
- The new spec asserts the host's thumbs-up appears on the host tile in the guest view, then the guest's clap appears on the guest tile in the host view.
- Result: the current workspace and the PM2-served app both pass this bidirectional reaction path. No signaling, room receiver, or tile rendering defect reproduced in the current code.

## Commands

```sh
E2E_BASE_URL=http://localhost:4810 E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 E2E_WS_ORIGIN=ws://localhost:4810 npm test -w e2e -- e2e/tests/fixloop-banner/reactions.spec.ts -g "Ask 3 reactions"
E2E_BASE_URL=http://localhost:4700 E2E_WS_ORIGIN=ws://localhost:4700 npm test -w e2e -- e2e/tests/fixloop-banner/reactions.spec.ts -g "Ask 3 reactions"
E2E_BASE_URL=http://localhost:4810 E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 E2E_WS_ORIGIN=ws://localhost:4810 npm test -w e2e -- e2e/tests/fixloop-banner
E2E_BASE_URL=http://localhost:4810 E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 E2E_WS_ORIGIN=ws://localhost:4810 npm test -w e2e -- e2e/tests/background-effects.spec.ts e2e/tests/background-host-self-view.spec.ts e2e/tests/background-picker-draggable.spec.ts
E2E_BASE_URL=http://localhost:4810 E2E_BACKEND_PORT=4820 E2E_FRONTEND_PORT=4811 E2E_PROXY_PORT=4810 E2E_WS_ORIGIN=ws://localhost:4810 npm test -w e2e -- e2e/tests/background-effects.spec.ts e2e/tests/background-host-self-view.spec.ts e2e/tests/background-picker-draggable.spec.ts e2e/tests/v3-mb2-webrtc/background-tab.spec.ts e2e/tests/v3-mb2-webrtc/background-tab-desktop.spec.ts
npm run build -w backend
npm run build -w frontend
pm2 restart meet-poc-be meet-poc-fe
E2E_BASE_URL=http://localhost:4700 E2E_WS_ORIGIN=ws://localhost:4700 npm test -w e2e -- e2e/tests/fixloop-banner/reactions.spec.ts -g "Ask 3 reactions"
```

## Results

- Isolated source-port Ask #3 spec: PASS
- PM2-served Ask #3 spec: PASS
- fixloop-banner: PASS, 17/17
- Background effects, host self-view, and picker draggable specs: PASS, 3/3
- v3-mb2-webrtc/background-tab and background-tab-desktop: FAIL before Ask #3 paths; both time out waiting for the stale `Start with camera on` label while screenshots show the current lobby exposes a `Camera off` button.
- Backend build: PASS
- Frontend build: PASS, with existing Angular warnings for Stencil empty glob and `@mediapipe/selfie_segmentation` CommonJS.
- PM2 deploy restart: PASS, `meet-poc-be` and `meet-poc-fe` online
- Post-deploy PM2 Ask #3 spec: PASS
