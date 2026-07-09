import * as fs from 'fs';
import * as path from 'path';

// Loudness measurement result (RMS + LUFS)
export interface Loudness {
  rms: number; // Linear RMS amplitude
  lufs: number; // Loudness Units relative to Full Scale (approximate ITU-R BS.1770-4)
}

// Voiced segment with loudness measurement
export interface VoicedSegment {
  startSample: number;
  endSample: number;
  loudness: Loudness;
}

// Complete recording analysis result
export interface RecordingAnalysis {
  recordingPath: string;
  voicedSegments: VoicedSegment[];
  overallLoudness: Loudness; // Aggregate of voiced segments
  transcriptPath?: string;
  transcriptContent?: string;
  verdict?: 'PASS' | 'FAIL' | 'INVALID';
  verdictReason?: string;
}

// Stimulus verification data (required for PASS verdict)
export interface StimulusVerification {
  intendedGain: number; // Expected gain applied to stimulus
  measuredGain: number; // Measured ratio from recording
  withinTolerance: boolean; // Typically +/-20%
}

// WAV file header structure
interface WavHeader {
  format: number;
  channels: number;
  sampleRate: number;
  bytesPerSecond: number;
  blockAlign: number;
  bitsPerSample: number;
  dataSize: number;
}

// Loudness analyzer: RMS + LUFS measurement from PCM audio
export class LoudnessAnalyzer {
  private readonly SILENCE_THRESHOLD = 0.0001; // Below this is silence
  private readonly LUFS_TARGET = -23; // Streaming standard target loudness

  // Measure RMS of float32 samples
  measureRMS(samples: Float32Array): number {
    if (samples.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    const mean = sum / samples.length;
    return Math.sqrt(mean);
  }

  // Approximate LUFS using ITU-R BS.1770-4 simplified gating
  // Gate on samples above silence threshold, then apply K-weighting approximation
  measureLUFS(samples: Float32Array, sampleRate: number): number {
    if (samples.length === 0) return -Infinity;

    // Gate: extract voiced frames (above silence threshold)
    const voicedSamples: number[] = [];
    for (let i = 0; i < samples.length; i++) {
      if (Math.abs(samples[i]) > this.SILENCE_THRESHOLD) {
        voicedSamples.push(samples[i]);
      }
    }

    if (voicedSamples.length === 0) return -Infinity;

    // Calculate RMS on voiced samples
    let voicedSum = 0;
    for (let i = 0; i < voicedSamples.length; i++) {
      voicedSum += voicedSamples[i] * voicedSamples[i];
    }
    const voicedRMS = Math.sqrt(voicedSum / voicedSamples.length);

    // Simple approximation: LUFS ≈ -0.691 + 10*log10(RMS²)
    // This is a simplified approximation without full K-weighting
    if (voicedRMS <= 0) return -Infinity;
    const lufs = -0.691 + 10 * Math.log10(voicedRMS * voicedRMS);
    return lufs;
  }

  // Measure loudness (RMS + LUFS) of PCM float32 samples
  measureLoudness(samples: Float32Array, sampleRate: number): Loudness {
    return {
      rms: this.measureRMS(samples),
      lufs: this.measureLUFS(samples, sampleRate),
    };
  }

  // Compute loudness ratio: A = quietLoudness / normalLoudness
  // Binding A definition: supports same-speaker attenuated-vs-normal comparison
  // Design: first-class loudness ratio API as specified in binding correction
  computeLoudnessRatio(quietLoudness: Loudness, normalLoudness: Loudness): number {
    if (normalLoudness.rms === 0) return 0;
    // Use RMS ratio as primary (LUFS ratio would be log-based and less intuitive for this use case)
    return quietLoudness.rms / normalLoudness.rms;
  }

  // Extract voiced segments from audio (continuous regions above silence threshold)
  extractVoicedSegments(samples: Float32Array, sampleRate: number): VoicedSegment[] {
    const segments: VoicedSegment[] = [];
    let inSegment = false;
    let segmentStart = 0;

    for (let i = 0; i < samples.length; i++) {
      const isVoiced = Math.abs(samples[i]) > this.SILENCE_THRESHOLD;

      if (isVoiced && !inSegment) {
        // Start new voiced segment
        segmentStart = i;
        inSegment = true;
      } else if (!isVoiced && inSegment) {
        // End voiced segment
        const segmentSamples = samples.slice(segmentStart, i);
        segments.push({
          startSample: segmentStart,
          endSample: i,
          loudness: this.measureLoudness(segmentSamples, sampleRate),
        });
        inSegment = false;
      }
    }

    // Handle segment that extends to end of audio
    if (inSegment) {
      const segmentSamples = samples.slice(segmentStart);
      segments.push({
        startSample: segmentStart,
        endSample: samples.length,
        loudness: this.measureLoudness(segmentSamples, sampleRate),
      });
    }

    return segments;
  }
}

// Recording arbiter: orchestrates recording analysis, transcript extraction, and verdict
export class RecordingArbiter {
  private analyzer = new LoudnessAnalyzer();
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || process.cwd();
  }

  // Validate that resolvedPath stays within baseDir (path traversal guard)
  private validatePath(inputPath: string): string {
    const resolved = path.resolve(inputPath);
    const base = path.resolve(this.baseDir);
    if (!resolved.startsWith(base + path.sep) && resolved !== base) {
      throw new Error(`Path traversal attempt: ${inputPath} resolves outside allowed base ${this.baseDir}`);
    }
    return resolved;
  }

  // Parse WAV file header and return metadata
  private parseWavHeader(buffer: Buffer): WavHeader {
    if (buffer.length < 44) throw new Error('Invalid WAV file: too small');

    // Check RIFF signature
    if (buffer.toString('ascii', 0, 4) !== 'RIFF') {
      throw new Error('Invalid WAV file: missing RIFF header');
    }

    // Find fmt chunk
    const fmtPos = buffer.indexOf(Buffer.from('fmt '));
    if (fmtPos === -1) throw new Error('Invalid WAV file: missing fmt chunk');

    // fmt chunk size is at fmtPos + 4
    const fmtChunkSize = buffer.readUInt32LE(fmtPos + 4);
    // Format fields start at fmtPos + 8
    const format = buffer.readUInt16LE(fmtPos + 8);
    const channels = buffer.readUInt16LE(fmtPos + 10);
    const sampleRate = buffer.readUInt32LE(fmtPos + 12);
    const bytesPerSecond = buffer.readUInt32LE(fmtPos + 16);
    const blockAlign = buffer.readUInt16LE(fmtPos + 20);
    const bitsPerSample = buffer.readUInt16LE(fmtPos + 22);

    // Find data chunk
    const dataPos = buffer.indexOf(Buffer.from('data'));
    if (dataPos === -1) throw new Error('Invalid WAV file: missing data chunk');

    const dataSize = buffer.readUInt32LE(dataPos + 4);

    return {
      format,
      channels,
      sampleRate,
      bytesPerSecond,
      blockAlign,
      bitsPerSample,
      dataSize,
    };
  }

  // Extract PCM audio data from WAV file buffer
  private extractPCMData(buffer: Buffer, header: WavHeader): Float32Array {
    const dataPos = buffer.indexOf(Buffer.from('data')) + 8;
    const dataBuffer = buffer.slice(dataPos, dataPos + header.dataSize);

    // Convert to float32
    const samples = new Float32Array(header.dataSize / (header.bitsPerSample / 8));

    if (header.bitsPerSample === 16) {
      for (let i = 0; i < samples.length; i++) {
        const int16 = dataBuffer.readInt16LE(i * 2);
        samples[i] = int16 / 32768; // Normalize to [-1, 1]
      }
    } else if (header.bitsPerSample === 8) {
      for (let i = 0; i < samples.length; i++) {
        const uint8 = dataBuffer[i];
        samples[i] = (uint8 - 128) / 128; // Normalize to [-1, 1]
      }
    } else {
      throw new Error(`Unsupported bit depth: ${header.bitsPerSample}`);
    }

    return samples;
  }

  // Analyze recording: read WAV, measure loudness, extract segments
  async analyzeRecording(recordingPath: string): Promise<RecordingAnalysis> {
    const validatedPath = this.validatePath(recordingPath);
    const buffer = fs.readFileSync(validatedPath);
    const header = this.parseWavHeader(buffer);

    // For now, mix to mono if multi-channel (simple average)
    const pcmData = this.extractPCMData(buffer, header);
    const monoSamples = this.mixToMono(pcmData, header.channels);

    // Extract voiced segments
    const voicedSegments = this.analyzer.extractVoicedSegments(monoSamples, header.sampleRate);

    // Calculate overall loudness from all voiced samples
    let overallLoudness: Loudness = { rms: 0, lufs: -Infinity };
    if (voicedSegments.length > 0) {
      // Concatenate all voiced segments
      let totalVoicedCount = 0;
      for (const seg of voicedSegments) {
        totalVoicedCount += seg.endSample - seg.startSample;
      }

      const voicedSamples = new Float32Array(totalVoicedCount);
      let offset = 0;
      for (const seg of voicedSegments) {
        voicedSamples.set(monoSamples.slice(seg.startSample, seg.endSample), offset);
        offset += seg.endSample - seg.startSample;
      }

      overallLoudness = this.analyzer.measureLoudness(voicedSamples, header.sampleRate);
    }

    return {
      recordingPath,
      voicedSegments,
      overallLoudness,
    };
  }

  // Mix multi-channel audio to mono by averaging channels
  private mixToMono(pcmData: Float32Array, channels: number): Float32Array {
    if (channels === 1) return pcmData;

    const monoLength = pcmData.length / channels;
    const monoSamples = new Float32Array(monoLength);

    for (let i = 0; i < monoLength; i++) {
      let sum = 0;
      for (let ch = 0; ch < channels; ch++) {
        sum += pcmData[i * channels + ch];
      }
      monoSamples[i] = sum / channels;
    }

    return monoSamples;
  }

  // Extract transcript (placeholder: would integrate with existing transcript logic)
  async extractTranscript(recordingPath: string): Promise<string | undefined> {
    // In real implementation, this would call the existing transcription pipeline
    // For now, this is a hook for future integration
    return undefined;
  }

  // Write verdict to a sidecar file
  async writeVerdict(recordingPath: string, verdict: 'PASS' | 'FAIL' | 'INVALID', reason?: string): Promise<void> {
    const validatedPath = this.validatePath(recordingPath);
    const verdictPath = validatedPath + '.verdict.json';
    const verdictData = {
      recordingPath,
      verdict,
      verdictReason: reason,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(verdictPath, JSON.stringify(verdictData, null, 2));
  }

  // Determine verdict based on analysis and stimulus verification
  // Rules:
  // - Stats never decide PASS alone
  // - INVALID when stimulus verification is missing (can't verify)
  // - FAIL when stimulus verification ran but gain is out of tolerance
  // - PASS only when stimulus verification confirms expected gain (within tolerance)
  determineVerdict(
    analysis: RecordingAnalysis,
    stimulusVerification?: StimulusVerification,
  ): { verdict: 'PASS' | 'FAIL' | 'INVALID'; reason: string } {
    // No stimulus verification = INVALID
    if (!stimulusVerification) {
      return {
        verdict: 'INVALID',
        reason: 'Missing stimulus verification data',
      };
    }

    // Stimulus verification ran but failed = FAIL
    if (!stimulusVerification.withinTolerance) {
      return {
        verdict: 'FAIL',
        reason: `Stimulus verification failed: measured gain ${stimulusVerification.measuredGain.toFixed(3)} outside tolerance of intended ${stimulusVerification.intendedGain.toFixed(3)}`,
      };
    }

    // Stats logged but never decide PASS alone
    // If stimulus verification passes, verdict is PASS
    return {
      verdict: 'PASS',
      reason: 'Stimulus verification passed; loudness recorded for reference',
    };
  }
}
