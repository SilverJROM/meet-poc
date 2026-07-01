export type SubscribeBindGuardInput = {
  capturedRecoveryEpoch: number;
  currentRecoveryEpoch: number;
  inFlightPublisherClientId: string;
  inFlightPublisherCfSessionId: string;
  currentPublisher: { clientId: string; cfSessionId: string } | null | undefined;
};

export function shouldBindSubscribeResponse(input: SubscribeBindGuardInput): boolean {
  if (input.capturedRecoveryEpoch !== input.currentRecoveryEpoch) return false;
  if (!input.currentPublisher) return false;
  if (input.currentPublisher.clientId !== input.inFlightPublisherClientId) return false;
  if (input.currentPublisher.cfSessionId !== input.inFlightPublisherCfSessionId) return false;
  return true;
}