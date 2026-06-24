export type PeerBackgroundKind = 'none' | 'blur' | 'image';

export type PeerBackground = {
  kind: PeerBackgroundKind;
  id?: string;
};

const BUILTIN_BACKGROUND_IDS = new Set(['city', 'library', 'beach', 'mountain', 'gradient']);

export function isBuiltinBackgroundId(id: string): boolean {
  return BUILTIN_BACKGROUND_IDS.has(id);
}

export function resolveBuiltinBackgroundUrl(id: string): string | null {
  if (!isBuiltinBackgroundId(id)) return null;
  return `/assets/backgrounds/${id}.svg`;
}

export function resolveCamOffBackdropUrl(background: PeerBackground | undefined, localImageUrl?: string | null): string | null {
  if (!background || background.kind !== 'image' || !background.id) return null;
  if (localImageUrl) return localImageUrl;
  return resolveBuiltinBackgroundUrl(background.id);
}

export interface PeerState {
  id: string;
  participantId: string;
  name: string;
  stream: MediaStream | null;
  pc: RTCPeerConnection | null;
  connectionState: string;
  isLocal: boolean;
  isHost: boolean;
  micEnabled: boolean;
  camEnabled: boolean;
  screenOn: boolean;
  reconnecting: boolean;
  isMobile: boolean;
  quality: 'good' | 'weak' | 'poor' | 'critical';
  audioOnlyReason: 'auto-poor' | 'manual-audio-only' | 'remote-request' | null;
  background?: PeerBackground;
  /** Local-only URL for custom/account backgrounds on cam-off tiles. */
  backgroundImageUrl?: string | null;
  // Mesh-specific fields, optional in SFU-only mode
  iceConnectionState?: string;
  iceGatheringState?: string;
  signalingState?: string;
  selectedCandidateType?: string | null;
  packetLossPct?: number | null;
  jitterMs?: number | null;
  rttMs?: number | null;
  availableOutgoingBitrateKbps?: number | null;
  updatedAt?: number;
  reconnectingSince?: number | null;
}
