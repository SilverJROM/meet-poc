# ws-heartbeat Scenarios

## DR-44 heartbeat and stale-socket termination

1. An admitted socket that stops answering native WebSocket pings is terminated by the server after two missed heartbeat cycles.
2. The server termination is treated as a drop: the close handler enters reconnect grace and does not call the explicit leave membership revocation path.
3. The dropped participant can reconnect with the same `clientKey` and resumes with the same participant identity without re-admit.
4. Browser clients receive app-level `heartbeat` messages, track last server liveness, and proactively close stale sockets with non-leave code `4000`.
5. DR-43 diagnostics include heartbeat miss and last heartbeat timing fields.

