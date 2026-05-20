# DR-30/DR-32 Scenarios

- DR-30 local self-view mirror: owner joins with camera on, a guest joins with camera on, the owner local tile video is horizontally mirrored, and the guest remote tile video is not mirrored.
- DR-30 screen-share exclusion: owner starts screen share, the presented share-stage video is not mirrored, the local self-view camera in the share strip remains mirrored, and the remote camera in the share strip remains unmirrored.
- DR-32 gallery stable order: with host, guest-a, and guest-b connected, forcing guest-b then guest-a as active speaker changes only the `.is-speaking` outline; gallery tile order remains unchanged.
- DR-32 share-strip stable order: during screen share, forcing guest-b then guest-a as active speaker changes only the `.is-speaking` outline; strip tile order remains unchanged.
- Regression coverage: existing DR-17/20 orientation/speaker checks, FIXC3 share-reflow checks, DR-26 MUI checks, and DR-31 reconnect checks remain green against the updated tile ordering and mirror behavior.
