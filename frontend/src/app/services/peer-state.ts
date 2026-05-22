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
