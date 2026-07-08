# North Star

Recent live call diagnostics show participants could be admitted, published, and have remote audio elements attached, but at least one client received a stalled SFU inbound audio track. Fix the reconnect/subscription recovery path so host and remote participant audio is bidirectional after disconnect/reconnect churn, then prove it with Peer2's US relay machine.

## Success Criteria

- Host and Peer2US can join the same DEV/live room and hear each other.
- Diagnostics show inbound audio bytes advancing in both directions after join and after at least one reconnect/resubscribe condition.
- Stale SFU presence/subscription state is cleaned or resubscribed; no peer remains merely "advertised" without a usable inbound audio subscription.
- Existing SFU publish/subscribe/reconnect regressions remain green.

