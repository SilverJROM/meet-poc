// Generate synthetic WAV files for bot-140 and bot-123 utterances.
// Used when piper is not available; replaces with real piper output when ready.

import * as fs from 'fs';
import * as path from 'path';

interface WavParams {
  sampleRate: number;
  durationMs: number;
  frequency: number; // Hz, for tone generation
  amplitude: number; // 0.0 to 1.0
}

function generateSyntheticWav(params: WavParams): Buffer {
  const { sampleRate, durationMs, frequency, amplitude } = params;
  const numSamples = Math.floor((sampleRate * durationMs) / 1000);

  // Allocate PCM buffer (16-bit mono)
  const pcmData = Buffer.alloc(numSamples * 2);

  // Generate sine wave with given frequency
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * frequency * t) * amplitude * 32767;
    pcmData.writeInt16LE(Math.round(sample), i * 2);
  }

  // Build WAV header
  const header = Buffer.alloc(44);
  const view = new DataView(header.buffer);

  // RIFF chunk descriptor
  header.write('RIFF', 0);
  view.setUint32(4, 36 + pcmData.length, true); // File size - 8
  header.write('WAVE', 8);

  // fmt subchunk
  header.write('fmt ', 12);
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true); // NumChannels (1 = mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate
  view.setUint16(32, 2, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample

  // data subchunk
  header.write('data', 36);
  view.setUint32(40, pcmData.length, true); // Subchunk2Size

  return Buffer.concat([header, pcmData]);
}

async function generateBotUtterances() {
  const fixtureRoot = __dirname;

  // Bot-140 utterances: 440 Hz tone (from audio-rig.ts TONE_SET)
  const bot140Utterances = [
    { name: 'hello', text: 'Hello, how are you?', durationMs: 1500, frequency: 440 },
    { name: 'thanks', text: 'Thank you for that', durationMs: 1200, frequency: 440 },
    { name: 'goodbye', text: 'Goodbye and thanks', durationMs: 1300, frequency: 440 },
  ];

  // Bot-123 utterances: 660 Hz tone (from audio-rig.ts TONE_SET)
  const bot123Utterances = [
    { name: 'hello', text: 'Hello, nice to meet you', durationMs: 1400, frequency: 660 },
    { name: 'im-fine', text: 'I am doing fine, thanks', durationMs: 1600, frequency: 660 },
    { name: 'great', text: 'That sounds great', durationMs: 1100, frequency: 660 },
  ];

  // Generate bot-140
  const bot140Dir = path.join(fixtureRoot, 'bot-140');
  const bot140Manifest: Array<{ name: string; text: string; path: string; durationMs: number; rmsEstimate: number }> =
    [];

  for (const utterance of bot140Utterances) {
    const wavBuffer = generateSyntheticWav({
      sampleRate: 16000,
      durationMs: utterance.durationMs,
      frequency: utterance.frequency,
      amplitude: 0.3, // Moderate amplitude for realistic loudness
    });

    const filePath = path.join(bot140Dir, `${utterance.name}.wav`);
    fs.writeFileSync(filePath, wavBuffer);

    bot140Manifest.push({
      name: utterance.name,
      text: utterance.text,
      path: `./bot-140/${utterance.name}.wav`,
      durationMs: utterance.durationMs,
      rmsEstimate: 0.3, // Approximate RMS for synthetic tone
    });
  }

  fs.writeFileSync(path.join(bot140Dir, 'manifest.json'), JSON.stringify(bot140Manifest, null, 2));

  // Generate bot-123
  const bot123Dir = path.join(fixtureRoot, 'bot-123');
  const bot123Manifest: Array<{ name: string; text: string; path: string; durationMs: number; rmsEstimate: number }> =
    [];

  for (const utterance of bot123Utterances) {
    const wavBuffer = generateSyntheticWav({
      sampleRate: 16000,
      durationMs: utterance.durationMs,
      frequency: utterance.frequency,
      amplitude: 0.3,
    });

    const filePath = path.join(bot123Dir, `${utterance.name}.wav`);
    fs.writeFileSync(filePath, wavBuffer);

    bot123Manifest.push({
      name: utterance.name,
      text: utterance.text,
      path: `./bot-123/${utterance.name}.wav`,
      durationMs: utterance.durationMs,
      rmsEstimate: 0.3,
    });
  }

  fs.writeFileSync(path.join(bot123Dir, 'manifest.json'), JSON.stringify(bot123Manifest, null, 2));

  console.log('✓ Generated synthetic WAVs for bot-140 and bot-123');
}

generateBotUtterances().catch(console.error);
