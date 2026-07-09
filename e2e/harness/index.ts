// Harness module exports: ledger, arbiter, scheduler, async brain, and call driver
export {
  initLedger,
  registerCreatedID,
  incrementCallBurn,
  isCallBurnExceeded,
  incrementGateCheck,
  isGateCheckExceeded,
  getState,
  resetLedger,
  canDelete,
  type CreatedIDType,
  type LedgerEntry,
  type LedgerState,
} from './call-ledger';
export { RecordingArbiter, LoudnessAnalyzer, type RecordingAnalysis, type StimulusVerification } from './recording-arbiter';
export { ConversationScheduler, type ConversationScript, type UtteranceSlot, type PlayedUtterance, type TimingReport } from './conversation-scheduler';
export { AsyncBrain, type AsyncBrainState, type LLMInvoker } from './async-brain';
export {
  gumShimInitScript,
  computeStimulusVerification,
  verifyStimulus,
  withinTolerance,
  DEFAULT_TOLERANCE_FRACTION,
} from './gum-shim';
export {
  modeAInitScript,
  modeBInitScript,
  buildInjectionTimeline,
  classifyHoldPhaseSignature,
  T_GAP_PROVISIONAL_MS,
  MIRRORED_MIC_SILENCE_LEVEL_THRESHOLD,
  MIRRORED_LEVEL_VARIANCE_THRESHOLD,
  type CaptureMode,
  type CaptureInjectionTimeline,
  type HoldPhaseSignature,
  type ModeAInjectionParams,
  type ModeBInjectionParams,
} from './capture-injection';
export {
  joinDualBrowserCall,
  dryRunDualBrowserCall,
  buildLaunchArgs,
  isOnRealMicHost,
  assertRealVirtualMicHost,
  type CallDriverConfig,
  type CallResult,
  type DeviceMode,
  type Stimulus,
  type CallProvenance,
} from './call-driver';
export { WavEncoder, type WavEncoderOptions } from './wav-encoder';
export {
  captureReceiveSideAudio,
  generateScriptTranscript,
  writeTranscriptFile,
  recordReceiveSideCall,
  type ReceiveSideRecordingResult,
} from './receive-side-recorder';
