export type InboundVideoExpectationContext = {
  manualAudioOnly: boolean;
  autoPaused: boolean;
  mobileAutoPaused: boolean;
  remotePaused: boolean;
};

export type InboundVideoExpectationPeer = {
  isLocal: boolean;
  camEnabled: boolean;
  screenOn: boolean;
};

export function isInboundVideoExpectedForPeer(
  peer: InboundVideoExpectationPeer | null | undefined,
  context: InboundVideoExpectationContext,
): boolean {
  if (!peer || peer.isLocal || (!peer.camEnabled && !peer.screenOn)) return false;
  if (context.manualAudioOnly) return false;
  if (context.autoPaused || context.mobileAutoPaused || context.remotePaused) return false;
  return true;
}
