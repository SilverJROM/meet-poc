export type VideoPolicyQuality = 'good' | 'weak' | 'poor';

export type AutoReceiverVideoPolicyDecision = 'none' | 'pause' | 'degrade' | 'restore';

export type AutoReceiverVideoPolicyInput = {
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  inboundVideoExpected: boolean;
  inboundPacketsReceivedTotal: number;
  quality: VideoPolicyQuality;
  audioOnlyFloor: boolean;
  poorSamples: number;
  restoreSamples: number;
  degradeThreshold: number;
  restoreThreshold: number;
  currentlyPaused: boolean;
  currentlyDegraded: boolean;
};

export function isTrulyDeadReceiverVideoLink(input: Pick<AutoReceiverVideoPolicyInput, 'connectionState' | 'iceConnectionState' | 'inboundVideoExpected' | 'inboundPacketsReceivedTotal'>): boolean {
  return (
    input.connectionState === 'failed' ||
    input.connectionState === 'disconnected' ||
    input.iceConnectionState === 'failed' ||
    input.iceConnectionState === 'disconnected' ||
    (input.inboundVideoExpected && input.inboundPacketsReceivedTotal === 0)
  );
}

export function decideAutoReceiverVideoPolicy(input: AutoReceiverVideoPolicyInput): AutoReceiverVideoPolicyDecision {
  if (input.restoreSamples >= input.restoreThreshold && input.quality !== 'poor' && (input.currentlyPaused || input.currentlyDegraded)) {
    return 'restore';
  }
  if (input.poorSamples < input.degradeThreshold) return 'none';
  if (input.audioOnlyFloor && isTrulyDeadReceiverVideoLink(input)) return 'pause';
  if (input.quality === 'poor' || input.audioOnlyFloor) return 'degrade';
  return 'none';
}
