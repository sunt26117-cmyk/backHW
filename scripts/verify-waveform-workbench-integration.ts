import fs from 'node:fs';
import path from 'node:path';
import { assignUniqueScopeRole, computeSpectrum, isUniformTime, resampleUniform } from '../src/utils/waveformViewerCore';

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
    'assignUniqueScopeRole',
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
// 遗留的示波器弹窗已在 WAVE-Test 融合批次删除（零引用证明见该批次记录）：唯一入口即上方的
// WaveformWorkbenchModal。若有人把旧入口再引回来，tsc 会因模块不存在直接报错，无需在此重复断言。

const roleInput = ['none', 'none', 'none'] as const;
const role0 = assignUniqueScopeRole(roleInput, 0, 'vbus');
const role1 = assignUniqueScopeRole(role0, 1, 'vbus');
if (role0[0] !== 'vbus' || role0[1] !== 'none') failures.push('assignUniqueScopeRole 首次 Vbus 映射异常');
if (roleInput.some((role) => role !== 'none')) failures.push('assignUniqueScopeRole 改写了调用方 role 数组');
if ((role0 as readonly string[]) === (roleInput as readonly string[])) failures.push('assignUniqueScopeRole 未返回新数组');
if (role1[0] !== 'none' || role1[1] !== 'vbus' || role1.filter((role) => role === 'vbus').length !== 1) {
  failures.push('相同工程角色重复映射未被消除：Vbus 不能静默覆盖或同时归属两个通道');
}

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
