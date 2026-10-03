import fs from 'node:fs';
import path from 'node:path';
import { computeSpectrum, isUniformTime, resampleUniform } from '../src/utils/waveformViewerCore';

const root = process.cwd();
const required: Array<[string, string[]]> = [
  ['src/components/WaveformWorkbenchModal.tsx', [
    'parseScopeCsv',
    'buildMeasurementsFromChannels',
    '真实时间轴',
    '保存为工程实测证据',
    'computeSpectrum',
  ]],
  ['src/utils/waveformViewerCore.ts', [
    'resampleUniform',
    'computeSpectrum',
    't: Float64Array',
    // 大小写按文件里的契约注释原样（原写成小写 source，导致这条门禁自身永远失败）。
    'Source waveform remains untouched',
  ]],
];

const failures: string[] = [];
for (const [rel, needles] of required) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) { failures.push('missing ' + rel); continue; }
  const text = fs.readFileSync(file, 'utf8');
  for (const needle of needles) if (!text.includes(needle)) failures.push(rel + ": missing '" + needle + "'");
}

const appModals = fs.readFileSync(path.join(root, 'src/components/AppModals.tsx'), 'utf8');
if (!appModals.includes("from './WaveformWorkbenchModal'")) failures.push('AppModals does not use WaveformWorkbenchModal');
if (appModals.includes("from './OscilloscopeImportModal'")) failures.push('legacy OscilloscopeImportModal import still active');

// 行为断言：把"原始波形不被改写 / 重采样后必须均匀"从注释标记落到真实调用上。
const t = Float64Array.from([0, 0.9e-9, 2.1e-9, 3e-9, 4.2e-9, 5.1e-9]);
const v = Float32Array.from([0, 1, -1, 2, -2, 3]);
const tBefore = Array.from(t).join(',');
const vBefore = Array.from(v).join(',');
if (isUniformTime(t)) failures.push('测试输入本身应是抖动（非均匀）时间轴，否则行为断言空转');
const out = resampleUniform(t, v);
if (Array.from(t).join(',') !== tBefore) failures.push('resampleUniform 改写了原始时间轴 t[]');
if (Array.from(v).join(',') !== vBefore) failures.push('resampleUniform 改写了原始样本 v[]');
if (!isUniformTime(out.t)) failures.push('resampleUniform 的输出不是均匀时间轴');
if (out.t.length < 2) failures.push('resampleUniform 输出点数异常：' + out.t.length);
const spectrum = computeSpectrum(out.t, out.v, 'hann');
if (!(spectrum.frequencies.length > 0)) failures.push('computeSpectrum 无法对重采样结果给出频谱');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('WAVEFORM_WORKBENCH_INTEGRATION_PASS');
