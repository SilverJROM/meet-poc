# v2-B8 Decision: Leave Dialog Button Order And Colors

## Decision

For hosts, show:

1. End meeting for everyone — primary danger
2. Leave but keep meeting going — secondary
3. Cancel — icon/ghost close

## Rationale

Ending for all is the highest-impact action and must be explicit. It appears first to match the host-specific decision being requested, but uses danger styling and a busy state to prevent accidental double-submit. The safer "leave but keep going" path remains visible as the second full button.
