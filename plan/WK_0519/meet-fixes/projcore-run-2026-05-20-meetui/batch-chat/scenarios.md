# Batch Chat Scenarios

## DR-27.1 Real-time admitted chat
- Given an owner and an admitted guest are in the same call
- When the owner opens chat and sends a text message
- Then the admitted guest receives the message in real time with the owner name, text, and timestamp

## DR-27.2 Unread badge
- Given a peer's chat panel is closed
- When a new chat message arrives
- Then the chat icon shows an unread count
- When the peer opens chat
- Then the unread count clears

## DR-27.3 Ephemeral no replay
- Given chat messages were exchanged in a call
- When the call ends and the room is joined again
- Then the chat panel starts empty and previous messages are not replayed

## DR-27.4 Admitted-only backend gate
- Given a socket is pending or waiting rather than admitted
- When it sends a chat message
- Then admitted peers do not receive it

## DR-27.5 XSS-safe text
- Given a chat message contains HTML/script-like text
- When it renders in the receiving panel
- Then it appears as plain text and no script executes

