# DR-37 Scenarios

## TS-DR37-01 persistent client key generation
- Given a browser joins a room for the first time
- When the room page sends the signaling join message
- Then it generates one opaque `meet-poc.clientKey` in localStorage
- And sends the same value on every later join from that browser

## TS-DR37-02 clientKey resumes active/reconnecting identity
- Given a guest was admitted with a persistent clientKey
- And the socket drops without a reconnect token on the next join
- When the same clientKey rejoins while the previous peer is admitted/reconnecting
- Then the server admits via the DR-31 resume path
- And emits `peer-resumed` with the original participantId

## TS-DR37-03 clientKey survives reconnect grace expiry
- Given a guest was admitted with a persistent clientKey
- And the previous peer is fully removed after reconnect grace expires
- When the same clientKey rejoins
- Then normal admit policy still applies for this batch
- But the admitted participantId is the original participantId

## TS-DR37-04 unknown clientKey is new identity
- Given a different clientKey joins the same room
- When it is admitted
- Then it receives a different participantId

## TS-DR37-05 browser reload
- Given a guest is admitted in a real browser
- When the page reloads and session reconnect state is gone
- Then localStorage keeps the clientKey
- And after normal re-admit the owner sees one peer card for the original participantId
