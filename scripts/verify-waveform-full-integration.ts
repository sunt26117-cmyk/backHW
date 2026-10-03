import fs from 'node:fs';
import path from 'node:path';
import { computeFFT, computeBLDCHarmonics } from '../src/waveform/waveTest/modules/fft';
import { resampleUniform } from '../src/waveform/waveTest/modules/resampler';
import { analyzeSamplingQuality } from '../src/waveform/waveTest/modules/qualityCheck';
import { evaluateMathExpression } from '../src/waveform/waveTest/modules/mathParser';
import type { WaveformChannel } from '../src/waveform/waveTest/types/models';

const root = process.cwd();
const mustExist = [
  'src/waveform/waveTest/types/models.ts',
  'src/waveform/waveTest/modules/autoSet.ts',
  'src/waveform/waveTest/modules/fft.ts',
  'src/waveform/waveTest/modules/mathParser.ts',
  'src/waveform/waveTest/modules/measurements.ts',
  'src/waveform/waveTest/modules/qualityCheck.ts',
  'src/waveform/waveTest/modules/resampler.ts',
  'src/waveform/waveTest/modules/transforms.ts',
  'src/waveform/waveTest/modules/trigger.ts',
  'src/waveform/waveTest/parsers/csvParser.ts',
  'src/waveform/waveTest/parsers/wfmParser.ts',
  'src/waveform/waveTest/engine/canvasRenderer.ts',
  'src/waveform/waveTest/engine/session.ts',
  'src/components/WaveformWorkbenchModal.tsx',
  'src/utils/oscilloscopeImport.ts',
  'src/utils/waveformStorage.ts',
];

const failures: string[] = [];
for (const rel of mustExist) {
  if (!fs.existsSync(path.join(root, rel))) failures.push(`missing ${rel}`);
}

const ui = fs.readFileSync(path.join(root, 'src/components/WaveformWorkbenchModal.tsx'), 'utf8');
for (const token of [
  'parseFullCsv',
  'parseWfmBuffer',
  'computeFFT',
  'computeMeasurements',
  'performAutoSet',
  'findTriggerPoint',
  'evaluateMathExpression',
  'computeClarke',
  'computePark',
  'computeInstantaneousPower',
  'computeBLDCHarmonics',
  'serializeSession',
  'deserializeSession',
  '保存为工程实测证据',
  'selectedRolePairs',
  'sampleRateDraft',
]) {
  if (!ui.includes(token)) failures.push(`UI missing capability token: ${token}`);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const testScript = packageJson.scripts?.test ?? '';
const wp11 = 'node scripts/verify-wp11-release-closure.cjs';
const fullGate = 'tsx scripts/verify-waveform-full-integration.ts';
if (!testScript.startsWith(wp11 + ' && ')) failures.push('WP11 must remain first npm test gate');
if ((testScript.match(new RegExp(wp11.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length !== 1) failures.push('WP11 gate must occur exactly once');
if (!testScript.includes(fullGate)) failures.push('full waveform gate missing from npm test');
if (testScript.indexOf(wp11) > testScript.indexOf(fullGate)) failures.push('full waveform gate moved before WP11');

const t = new Float64Array([0, 0.9e-9, 2.1e-9, 3e-9, 4.2e-9, 5.1e-9, 6e-9, 7.1e-9]);
const v = Float32Array.from(t, (x) => Math.sin(2 * Math.PI * 1e6 * x));
const tBefore = Array.from(t);
const vBefore = Array.from(v);
const quality = analyzeSamplingQuality(t);
if (quality.isUniformSampling) failures.push('adaptive-time fixture was incorrectly classified as uniform');
const rs = resampleUniform(t, v, { nominalDt: quality.medianDt ?? undefined });
if (Array.from(t).some((x, i) => x !== tBefore[i])) failures.push('resampler mutated source t[]');
if (Array.from(v).some((x, i) => x !== vBefore[i])) failures.push('resampler mutated source v[]');
for (let i = 2; i < rs.t.length; i++) {
  const a = rs.t[i] - rs.t[i - 1];
  const b = rs.t[i - 1] - rs.t[i - 2];
  if (Math.abs(a - b) > Math.max(Math.abs(a), Math.abs(b)) * 1e-8) {
    failures.push('resampler output is not uniform');
    break;
  }
}
if (!(rs.fs > 0)) failures.push('resampler did not produce a valid fs');

const fft = computeFFT(
  rs.t,
  rs.v,
  rs.fs,
  { range: 'entire', window: 'hann', scale: 'db', zeroPadding: 2, removeDC: true, peakThresholdDb: -80, maxPeaks: 8 },
  'fixture',
  'fixture',
);
if (!(fft.frequencies.length > 0 && fft.peaks.length >= 0)) failures.push('computeFFT failed on resampled waveform');

const ch = (name: string, data: number[]): WaveformChannel => ({
  id: name,
  name,
  unit: 'V',
  color: '#22d3ee',
  visible: true,
  t: Float64Array.from(data.map((_, i) => i * 1e-6)),
  v: Float32Array.from(data),
  fs: 1e6,
  dt: 1e-6,
  isMath: false,
  sourceChannelIds: [],
  metadata: {
    originalSampleCount: data.length,
    originalTimeStart: 0,
    originalTimeEnd: (data.length - 1) * 1e-6,
    isUniformSampling: true,
    nominalDt: 1e-6,
    medianDt: 1e-6,
    meanDt: 1e-6,
    minDt: 1e-6,
    maxDt: 1e-6,
    jitterRms: 0,
    jitterMax: 0,
    droppedSamples: 0,
    invalidSamples: 0,
    sampleRate: 1e6,
    qualityStatus: 'uniform',
    gapCount: 0,
    gapIndices: [],
  },
  vMin: -2,
  vMax: 2,
});

const ch1 = ch('CH1', [1, 2, 3, 4, 3, 2, 1, 0]);
const ch2 = ch('CH2', [0, 1, 1, 2, 2, 1, 1, 0]);
const math = evaluateMathExpression('CH1-CH2', { CH1: ch1, CH2: ch2 }, ['CH1', 'CH2'], 'math_1', 'CH1-CH2');
if (Math.abs(math.v[0] - 1) > 1e-6 || Math.abs(math.v[3] - 2) > 1e-6) failures.push('Math channel calculation did not derive from real channel input');

const missingMotor = computeBLDCHarmonics({ enabled: true, rpm: null, polePairs: null });
if (missingMotor.fe !== null || missingMotor.markers.length !== 0) failures.push('BLDC harmonic analysis must fail closed on missing RPM/pole-pairs');

const legacy = path.join(root, 'src/components/OscilloscopeImportModal.tsx');
if (fs.existsSync(legacy)) failures.push('legacy OscilloscopeImportModal still exists');

const viewerCore = path.join(root, 'src/utils/waveformViewerCore.ts');
if (fs.existsSync(viewerCore)) failures.push('simplified duplicate waveformViewerCore still exists');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('WAVEFORM_FULL_INTEGRATION_PASS');
