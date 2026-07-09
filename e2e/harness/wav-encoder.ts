// Minimal WAV encoder: PCM float32 → WAV binary (RIFF format)
// Produces 16-bit PCM WAV files compatible with RecordingArbiter.analyzeRecording()

export interface WavEncoderOptions {
  sampleRate?: number; // Hz (default 48000)
  channels?: number; // 1=mono, 2=stereo (default 1)
  bitsPerSample?: number; // 16 or 24 (default 16)
}

export class WavEncoder {
  private sampleRate: number;
  private channels: number;
  private bitsPerSample: number;

  constructor(options: WavEncoderOptions = {}) {
    this.sampleRate = options.sampleRate || 48000;
    this.channels = options.channels || 1;
    this.bitsPerSample = options.bitsPerSample || 16;
  }

  /**
   * Encode float32 PCM samples to WAV binary.
   * @param samples Float32Array of PCM samples, range [-1, 1]
   * @returns Buffer containing complete WAV file
   */
  encode(samples: Float32Array): Buffer {
    const bytesPerSample = this.bitsPerSample / 8;
    const byteRate = this.sampleRate * this.channels * bytesPerSample;
    const blockAlign = this.channels * bytesPerSample;
    const dataSize = samples.length * bytesPerSample;

    // RIFF container size (everything except RIFF header itself)
    const riffSize = 36 + dataSize;

    // Allocate buffer: RIFF(12) + fmt(24) + data(8+dataSize)
    const buffer = Buffer.alloc(44 + dataSize);
    let offset = 0;

    // RIFF header
    buffer.write('RIFF', offset);
    offset += 4;
    buffer.writeUInt32LE(riffSize, offset);
    offset += 4;
    buffer.write('WAVE', offset);
    offset += 4;

    // fmt subchunk
    buffer.write('fmt ', offset);
    offset += 4;
    buffer.writeUInt32LE(16, offset); // Subchunk1Size (16 for PCM)
    offset += 4;
    buffer.writeUInt16LE(1, offset); // AudioFormat (1 = PCM)
    offset += 2;
    buffer.writeUInt16LE(this.channels, offset); // NumChannels
    offset += 2;
    buffer.writeUInt32LE(this.sampleRate, offset); // SampleRate
    offset += 4;
    buffer.writeUInt32LE(byteRate, offset); // ByteRate
    offset += 4;
    buffer.writeUInt16LE(blockAlign, offset); // BlockAlign
    offset += 2;
    buffer.writeUInt16LE(this.bitsPerSample, offset); // BitsPerSample
    offset += 2;

    // data subchunk
    buffer.write('data', offset);
    offset += 4;
    buffer.writeUInt32LE(dataSize, offset); // Subchunk2Size
    offset += 4;

    // Write PCM samples
    if (this.bitsPerSample === 16) {
      for (let i = 0; i < samples.length; i++) {
        // Clamp to [-1, 1] and convert to 16-bit signed int
        const sample = Math.max(-1, Math.min(1, samples[i]));
        const int16 = Math.round(sample * 32767);
        buffer.writeInt16LE(int16, offset);
        offset += 2;
      }
    } else {
      throw new Error(`Unsupported bit depth: ${this.bitsPerSample}`);
    }

    return buffer;
  }
}
