import fs from 'node:fs/promises';
import path from 'node:path';
import { getRepoRoot } from '../src/db.js';
import { LlmService } from '../src/modules/llm/index.js';

interface TranscriptLine {
  name?: string | null;
  text?: string;
}

interface TranscriptFile {
  lines?: TranscriptLine[];
}

interface Timing {
  model: string;
  summaryMs: number;
  actionsMs: number;
  totalMs: number;
  ranAtIso: string;
}

interface ManualScore {
  summaryAccuracy: number;
  actionsAccuracy: number;
  notes: string;
}

const models = ['qwen2.5:14b-instruct', 'mistral-nemo:12b', 'phi4:14b', 'gpt-oss:20b', 'gemma2:9b'];
const workRoot = 'plan/WK_0519/meet-fixes/projcore-run-2026-05-19-fixc';
const batchRoot = path.join(workRoot, 'batch-fixc6');
const inputRoot = path.join(batchRoot, 'benchmark-input');
const runsRoot = path.join(batchRoot, 'benchmark-runs');
const decisionPath = path.join(workRoot, 'decisions/2026-05-19-fixc-ollama-benchmark.md');
const scoresPath = path.join(batchRoot, 'manual-scores.json');

function safeModelName(model: string): string {
  return model.replace(/[^a-zA-Z0-9_.-]+/g, '_');
}

async function readText(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf8');
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readText(filePath)) as T;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function transcriptText(transcript: TranscriptFile): string {
  const lines = transcript.lines ?? [];
  return lines
    .map((line) => `${line.name || 'Unknown'}: ${line.text || ''}`.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

function summaryPrompt(text: string): string {
  return `You are a meeting-notes assistant. The following is a transcript of a meeting between two or more participants. Produce a 3-5 sentence summary capturing the main topics discussed and any decisions made. Return only the summary text, no preamble.\n\nTranscript:\n${text}`;
}

function actionsPrompt(text: string): string {
  return `You are a meeting-notes assistant. The following is a transcript of a meeting between two or more participants. Extract any concrete action items as a bullet list. Each bullet should be \`- <person>: <action>\`. If no action items exist, return exactly \`(none)\`. Return only the list, no preamble.\n\nTranscript:\n${text}`;
}

async function invokeTimed(service: LlmService, model: string, prompt: string): Promise<{ text: string; ms: number }> {
  const started = Date.now();
  const response = await service.get('ollama').invoke({ model, prompt, timeoutMs: 180_000 });
  return { text: response.text, ms: Date.now() - started };
}

async function runBenchmarks(repoRoot: string): Promise<void> {
  const transcript = await readJson<TranscriptFile>(path.join(repoRoot, inputRoot, 'transcript.json'));
  const text = transcriptText(transcript);
  const service = new LlmService();

  for (const model of models) {
    const modelDir = path.join(repoRoot, runsRoot, safeModelName(model));
    await fs.mkdir(modelDir, { recursive: true });
    console.log(`[benchmark] running ${model} summary`);
    const summary = await invokeTimed(service, model, summaryPrompt(text));
    await fs.writeFile(path.join(modelDir, 'summary.txt'), `${summary.text}\n`);

    console.log(`[benchmark] running ${model} action-items`);
    const actions = await invokeTimed(service, model, actionsPrompt(text));
    await fs.writeFile(path.join(modelDir, 'actions.txt'), `${actions.text}\n`);

    const timing: Timing = {
      model,
      summaryMs: summary.ms,
      actionsMs: actions.ms,
      totalMs: summary.ms + actions.ms,
      ranAtIso: new Date().toISOString(),
    };
    await fs.writeFile(path.join(modelDir, 'timing.json'), `${JSON.stringify(timing, null, 2)}\n`);
  }
}

async function loadScores(repoRoot: string): Promise<Record<string, ManualScore>> {
  const fullPath = path.join(repoRoot, scoresPath);
  if (!(await exists(fullPath))) return {};
  return readJson<Record<string, ManualScore>>(fullPath);
}

function scoreValue(score?: ManualScore): number {
  if (!score) return 0;
  return (score.summaryAccuracy + score.actionsAccuracy) / 2;
}

async function writeReport(repoRoot: string): Promise<void> {
  const goldSummary = (await readText(path.join(repoRoot, inputRoot, 'gold-summary.md'))).trim();
  const goldActions = (await readText(path.join(repoRoot, inputRoot, 'gold-actions.md'))).trim();
  const scores = await loadScores(repoRoot);

  const rows = [];
  for (const model of models) {
    const modelDir = path.join(repoRoot, runsRoot, safeModelName(model));
    const summary = (await readText(path.join(modelDir, 'summary.txt'))).trim();
    const actions = (await readText(path.join(modelDir, 'actions.txt'))).trim();
    const timing = await readJson<Timing>(path.join(modelDir, 'timing.json'));
    rows.push({ model, summary, actions, timing, score: scores[model] });
  }

  const ranked = [...rows].sort((a, b) => {
    const scoreDelta = scoreValue(b.score) - scoreValue(a.score);
    if (scoreDelta !== 0) return scoreDelta;
    return a.timing.totalMs - b.timing.totalMs;
  });

  const lines = [
    '# FIXC6 Ollama Transcript Cleanup Benchmark',
    '',
    '## Input',
    '- Transcript: `batch-fixc6/benchmark-input/transcript.json`',
    '- Selection note: the specified JROM Test transcript and FIX-B4 synthetic fallback were too thin for meaningful ranking, so the committed synthetic 60-second multi-speaker transcript was used per the batch fallback rule.',
    '- Ranking rule: accuracy first, speed as tiebreaker.',
    '',
    '## Gold Summary',
    goldSummary,
    '',
    '## Gold Action Items',
    goldActions,
    '',
    '## Ranking',
    '| Rank | Model | Avg accuracy | Summary | Actions | Total seconds | Notes |',
    '|---:|---|---:|---:|---:|---:|---|',
    ...ranked.map((row, index) => {
      const score = row.score;
      const avg = score ? scoreValue(score).toFixed(1) : 'TBD';
      const summaryScore = score ? String(score.summaryAccuracy) : 'TBD';
      const actionsScore = score ? String(score.actionsAccuracy) : 'TBD';
      const prefix = index < 3 ? '★ ' : '';
      return `| ${index + 1} | ${prefix}${row.model} | ${avg} | ${summaryScore} | ${actionsScore} | ${(row.timing.totalMs / 1000).toFixed(1)} | ${score?.notes ?? 'Pending manual score'} |`;
    }),
    '',
    '## Outputs',
  ];

  for (const row of rows) {
    lines.push(
      '',
      `### ${row.model}`,
      `- Summary latency: ${(row.timing.summaryMs / 1000).toFixed(1)}s`,
      `- Action-items latency: ${(row.timing.actionsMs / 1000).toFixed(1)}s`,
      `- Total latency: ${(row.timing.totalMs / 1000).toFixed(1)}s`,
      '',
      'Summary:',
      '',
      row.summary,
      '',
      'Action items:',
      '',
      row.actions,
    );
  }

  await fs.mkdir(path.dirname(path.join(repoRoot, decisionPath)), { recursive: true });
  await fs.writeFile(path.join(repoRoot, decisionPath), `${lines.join('\n')}\n`);
  console.log(`[benchmark] wrote ${decisionPath}`);
}

async function main(): Promise<void> {
  const repoRoot = getRepoRoot();
  if (!process.argv.includes('--report-only')) await runBenchmarks(repoRoot);
  await writeReport(repoRoot);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
