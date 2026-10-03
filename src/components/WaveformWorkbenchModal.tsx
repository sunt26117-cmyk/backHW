import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, BarChart3, CheckCircle2, Download, FileArchive, FileText, Maximize2,
  MousePointer2, Play, RefreshCw, Save, Settings2, SlidersHorizontal, Upload, X, Zap
} from 'lucide-react';

import type {
  ChannelMeasurements,
  CursorsState,
  FFTOptions,
  FFTWindowType,
  MeasurementGate,
  MotorConfig,
  PlotMode,
  TriggerConfig,
  ViewState,
  WaveformChannel,
} from '../waveform/waveTest/types/models';

import { previewCsv, parseFullCsv } from '../waveform/waveTest/parsers/csvParser';
import { parseWfmBuffer } from '../waveform/waveTest/parsers/wfmParser';
import { analyzeSamplingQuality } from '../waveform/waveTest/modules/qualityCheck';
import { resampleUniform } from '../waveform/waveTest/modules/resampler';
import { computeFFT, computeBLDCHarmonics } from '../waveform/waveTest/modules/fft';
import { computeMeasurements } from '../waveform/waveTest/modules/measurements';
import { performAutoSet } from '../waveform/waveTest/modules/autoSet';
import { findTriggerPoint, alignViewToTrigger } from '../waveform/waveTest/modules/trigger';
import { evaluateMathExpression } from '../waveform/waveTest/modules/mathParser';
import { computeClarke, computePark, computeInstantaneousPower } from '../waveform/waveTest/modules/transforms';
import { serializeSession, deserializeSession } from '../waveform/waveTest/engine/session';

import {
  buildMeasurementsFromChannels,
  type ParsedScope,
  type ScopeRole,
} from '../utils/oscilloscopeImport';
import { addWaveforms, toStoredWaveform } from '../utils/waveformStorage';
import type { MeasurementProvenance } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onApplyMeasured: (
    values: Record<string, number | string>,
    provenance: Record<string, MeasurementProvenance>,
  ) => void;
  showToast: (text: string, type?: 'success' | 'info' | 'error') => void;
  scenarioId?: string;
}

type CursorTool = 'x' | 'y' | 'xy' | null;

const COLORS = ['#22d3ee', '#f59e0b', '#a78bfa', '#4ade80', '#fb7185', '#60a5fa', '#f472b6', '#facc15'];

const DEFAULT_FFT: FFTOptions = {
  range: 'view',
  window: 'hann',
  scale: 'db',
  zeroPadding: 1,
  removeDC: true,
  peakThresholdDb: -60,
  minPeakDistanceHz: undefined,
  maxPeaks: 8,
};

const DEFAULT_CURSOR: CursorsState = {
  enabled: false,
  type: 'x',
  x1: null,
  x2: null,
  y1: null,
  y2: null,
  trackingChannel: null,
};

const DEFAULT_MOTOR: MotorConfig = {
  rpm: null,
  polePairs: null,
  enabled: false,
};

const DEFAULT_TRIGGER: TriggerConfig = {
  enabled: false,
  channelId: '',
  type: 'rising',
  level: 0,
  positionPercent: 50,
};

const DEFAULT_VIEW: ViewState = { startIndex: 0, endIndex: 0 };

const buildInitialChannelMap = (channels: Record<string, WaveformChannel>) => {
  const next: Record<string, WaveformChannel> = {};
  let i = 0;
  for (const [id, ch] of Object.entries(channels)) {
    next[id] = { ...ch, color: ch.color || COLORS[i % COLORS.length], visible: ch.visible !== false };
    i++;
  }
  return next;
};

const engineeringToScope = (
  channels: Record<string, WaveformChannel>,
  drawOrder: string[],
  roles: Record<string, ScopeRole>,
): ParsedScope => {
  const firstId = drawOrder.find((id) => channels[id] && channels[id].t.length > 1);
  if (!firstId) throw new Error('没有可用于工程证据回填的波形通道。');

  const base = channels[firstId];
  const time = Array.from(base.t);
  const selected = drawOrder
    .map((id, idx) => ({ id, idx, channel: channels[id] }))
    .filter((x) => x.channel && roles[x.id] && roles[x.id] !== 'none');

  return {
    time,
    rowCount: time.length,
    sampleRateHz: base.fs || (base.dt && base.dt > 0 ? 1 / base.dt : 0),
    channels: selected.map((x) => ({
      name: x.channel.name,
      samples: Array.from(x.channel.v),
    })),
  };
};

const safeRange = (view: ViewState, n: number) => {
  const start = Math.max(0, Math.min(Math.max(0, n - 1), view.startIndex));
  const end = Math.max(start + 1, Math.min(n, view.endIndex || n));
  return { start, end };
};

const createMathColor = (index: number) => ['#f472b6', '#c084fc', '#fb7185', '#e879f9'][index % 4];

export const WaveformWorkbenchModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onApplyMeasured,
  showToast,
  scenarioId,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fileName, setFileName] = useState('');
  const [channels, setChannels] = useState<Record<string, WaveformChannel>>({});
  const [drawOrder, setDrawOrder] = useState<string[]>([]);
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW);
  const [plotMode, setPlotMode] = useState<PlotMode>('time');
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [selectedFftChannelId, setSelectedFftChannelId] = useState('');
  const [cursors, setCursors] = useState<CursorsState>(DEFAULT_CURSOR);
  const [cursorTool, setCursorTool] = useState<CursorTool>(null);
  const [fftOptions, setFftOptions] = useState<FFTOptions>(DEFAULT_FFT);
  const [triggerConfig, setTriggerConfig] = useState<TriggerConfig>(DEFAULT_TRIGGER);
  const [measurementGate, setMeasurementGate] = useState<MeasurementGate>('view');
  const [separateView, setSeparateView] = useState(false);
  const [roles, setRoles] = useState<Record<string, ScopeRole>>({});
  const [motorConfig, setMotorConfig] = useState<MotorConfig>(DEFAULT_MOTOR);
  const [mathExpression, setMathExpression] = useState('');
  const [mathName, setMathName] = useState('Math 1');
  const [transformMode, setTransformMode] = useState<'none' | 'clarke' | 'park' | 'power'>('none');
  const [transformInputs, setTransformInputs] = useState<Record<string, string>>({});
  const [sampleRateDraft, setSampleRateDraft] = useState('1000000');
  const [qualityVisible, setQualityVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [fftError, setFftError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Array<{ id: string; x: number; y: number; text: string; channelId: string }>>([]);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [dragState, setDragState] = useState<{ x: number; view: ViewState } | null>(null);

  const activeChannel = channels[selectedChannelId] || channels[drawOrder[0]];
  const fftChannel = channels[selectedFftChannelId] || activeChannel;

  useEffect(() => {
    if (!drawOrder.length) return;
    setSelectedChannelId((prev) => (prev && channels[prev] ? prev : drawOrder[0]));
    setSelectedFftChannelId((prev) => (prev && channels[prev] ? prev : drawOrder[0]));
    setView((prev) => ({
      ...prev,
      startIndex: Math.max(0, Math.min(prev.startIndex, Math.max(0, (channels[drawOrder[0]]?.t.length || 1) - 2))),
      endIndex: prev.endIndex > 0
        ? Math.min(prev.endIndex, channels[drawOrder[0]]?.t.length || prev.endIndex)
        : channels[drawOrder[0]]?.t.length || 0,
    }));
  }, [drawOrder, channels]);

  const sourceQuality = useMemo(() => {
    if (!activeChannel || activeChannel.t.length < 2) return null;
    return analyzeSamplingQuality(activeChannel.t, activeChannel.metadata?.invalidSamples || 0);
  }, [activeChannel]);

  const measurement = useMemo<ChannelMeasurements | null>(() => {
    if (!activeChannel) return null;
    return computeMeasurements(
      activeChannel,
      measurementGate,
      view,
      cursors,
    );
  }, [activeChannel, measurementGate, view, cursors]);

  const preparedFFT = useMemo(() => {
    if (!fftChannel || fftChannel.v.length < 4) return null;
    try {
      if (fftOptions.range === 'cursors' && !(cursors.enabled && cursors.x1 !== null && cursors.x2 !== null)) {
        throw new Error('FFT 范围设为游标，但当前未设置 X1/X2。');
      }
      const r = safeRange(view, fftChannel.v.length);
      let start = 0;
      let end = fftChannel.v.length;
      if (fftOptions.range === 'view') {
        start = r.start;
        end = r.end;
      } else if (fftOptions.range === 'cursors' && cursors.x1 !== null && cursors.x2 !== null) {
        const lo = Math.min(cursors.x1, cursors.x2);
        const hi = Math.max(cursors.x1, cursors.x2);
        start = 0;
        while (start < fftChannel.t.length && fftChannel.t[start] < lo) start++;
        end = start;
        while (end < fftChannel.t.length && fftChannel.t[end] <= hi) end++;
        end = Math.max(start + 1, end);
      }
      const rawT = fftChannel.t.slice(start, end);
      const rawV = fftChannel.v.slice(start, end);
      let fftT = rawT;
      let fftV = rawV;
      let fs = fftChannel.fs || 0;
      if (!(fftChannel.metadata?.isUniformSampling && fs > 0)) {
        const dt = fftChannel.metadata?.medianDt || fftChannel.dt || 0;
        if (!(dt > 0)) throw new Error('非均匀时间轴且无法确定有效 nominal dt。');
        const rs = resampleUniform(rawT, rawV, { nominalDt: dt });
        fftT = rs.t;
        fftV = rs.v;
        fs = rs.fs;
      }
      if (!(fs > 0)) throw new Error('无法从当前时间轴得到有效采样率。');
      return computeFFT(fftT, fftV, fs, fftOptions, fftChannel.id, fftChannel.name);
    } catch (err: any) {
      return { error: err?.message || 'FFT 计算失败' };
    }
  }, [fftChannel, fftOptions, view, cursors]);

  const harmonicResult = useMemo(
    () => computeBLDCHarmonics(motorConfig),
    [motorConfig],
  );

  const addChannel = useCallback((channel: WaveformChannel) => {
    setChannels((prev) => ({ ...prev, [channel.id]: channel }));
    setDrawOrder((prev) => prev.includes(channel.id) ? prev : [...prev, channel.id]);
    setRoles((prev) => ({ ...prev, [channel.id]: 'none' }));
  }, []);

  const replaceDataset = useCallback((
    nextChannels: Record<string, WaveformChannel>,
    nextOrder: string[],
    name: string,
  ) => {
    const normalized = buildInitialChannelMap(nextChannels);
    setChannels(normalized);
    setDrawOrder(nextOrder);
    setFileName(name);
    setRoles(Object.fromEntries(nextOrder.map((id) => [id, 'none'])));
    setSelectedChannelId(nextOrder[0] || '');
    setSelectedFftChannelId(nextOrder[0] || '');
    const n = normalized[nextOrder[0]]?.t.length || 0;
    setView({ startIndex: 0, endIndex: n });
    setCursors({ ...DEFAULT_CURSOR });
    setAnnotations([]);
    setAnnotationMode(false);
    setFftError(null);
    setImportError(null);
  }, []);

  const importCsv = async (file: File) => {
    setImportError(null);
    try {
      const text = await file.text();
      const p = previewCsv(text);
      const mappings = p.columnMappings.map((m) => ({ ...m }));
      const sampleRate = p.timeColIndex < 0 ? Number(sampleRateDraft) : undefined;
      const parsed = parseFullCsv(text, {
        delimiter: p.delimiter,
        hasHeader: p.hasHeader,
        timeColIndex: p.timeColIndex,
        timeUnit: p.timeUnit,
        columnMappings: mappings,
        resample: false,
        colors: COLORS,
        sampleRate,
      });
      replaceDataset(parsed.channels, parsed.drawOrder, file.name);
      showToast(`已导入 ${file.name}：${parsed.drawOrder.length} 通道 / ${parsed.channels[parsed.drawOrder[0]]?.t.length.toLocaleString() || 0} 点`, 'success');
    } catch (err: any) {
      const msg = err?.message || 'CSV/TXT 导入失败';
      setImportError(msg);
      showToast(msg, 'error');
    }
  };

  const importWfm = async (file: File) => {
    setImportError(null);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseWfmBuffer(buffer, file.name, COLORS);
      replaceDataset(parsed.channels, parsed.drawOrder, file.name);
      showToast(`已导入 ${file.name}：${parsed.drawOrder.length} 通道`, 'success');
    } catch (err: any) {
      const msg = err?.message || 'WFM 导入失败';
      setImportError(msg);
      showToast(msg, 'error');
    }
  };

  const importFile = async (file: File) => {
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'wfm') return importWfm(file);
    return importCsv(file);
  };

  const assignRole = (channelId: string, role: ScopeRole) => {
    setRoles((prev) => {
      const next = { ...prev };
      if (role !== 'none') {
        for (const id of Object.keys(next)) {
          if (id !== channelId && next[id] === role) next[id] = 'none';
        }
      }
      next[channelId] = role;
      return next;
    });
  };

  const fit = () => {
    if (!activeChannel) return;
    const n = activeChannel.t.length;
    setView({ startIndex: 0, endIndex: n, fMin: undefined, fMax: undefined });
  };

  const autoSet = () => {
    if (!drawOrder.length) return;
    const result = performAutoSet(channels, drawOrder, view);
    setView(result.view);
    setTriggerConfig(result.triggerConfig);
    setChannels((prev) => {
      const next = { ...prev };
      for (const [id, scale] of Object.entries(result.updatedChannels)) {
        if (next[id]) next[id] = { ...next[id], ...scale };
      }
      return next;
    });
    setSelectedChannelId(result.triggerConfig.channelId || selectedChannelId);
    showToast(result.statusMessage, 'info');
  };

  const applyTrigger = () => {
    if (!activeChannel || !triggerConfig.enabled) return;
    const point = findTriggerPoint(activeChannel, triggerConfig);
    if (!point) {
      showToast('当前波形未找到符合条件的触发边沿。', 'info');
      return;
    }
    setView((prev) => alignViewToTrigger(prev, activeChannel, point.triggerIndex, triggerConfig.positionPercent));
  };

  const addMath = () => {
    if (!mathExpression.trim()) {
      showToast('请输入数学表达式，例如 CH1-CH2 或 rms(CH1)。', 'info');
      return;
    }
    try {
      const id = `math_${Date.now()}`;
      const name = mathName.trim() || id;
      const mathChannel = evaluateMathExpression(mathExpression, channels, drawOrder, id, name);
      mathChannel.color = createMathColor(drawOrder.length);
      addChannel(mathChannel);
      setMathExpression('');
      showToast(`数学通道 ${name} 已创建。`, 'success');
    } catch (err: any) {
      showToast(err?.message || '数学表达式计算失败', 'error');
    }
  };

  const applyTransform = () => {
    try {
      const get = (key: string) => channels[transformInputs[key]];
      const ua = get('ua')?.v;
      const ub = get('ub')?.v;
      const uc = get('uc')?.v;
      if (!ua || !ub || !uc) throw new Error('Clarke/Park 至少需要 Ua、Ub、Uc 三个通道。');

      if (transformMode === 'clarke') {
        const r = computeClarke(ua, ub, uc);
        const base = get('ua')!;
        const defs = [
          ['clarke_alpha', 'Clarke α', r.alpha],
          ['clarke_beta', 'Clarke β', r.beta],
          ['clarke_zero', 'Clarke 0', r.zero],
        ] as const;
        defs.forEach(([id, name, v], idx) => addChannel({
          ...base,
          id,
          name,
          v,
          color: COLORS[(drawOrder.length + idx) % COLORS.length],
          isMath: true,
          mathExpression: 'Clarke(Ua,Ub,Uc)',
          sourceChannelIds: [get('ua')!.id, get('ub')!.id, get('uc')!.id],
        }));
      } else if (transformMode === 'park') {
        const alpha = get('alpha')?.v;
        const beta = get('beta')?.v;
        if (!alpha || !beta) throw new Error('Park 变换需要 α、β 通道。');
        let theta = get('theta')?.v;
        if (!theta) {
          if (!(motorConfig.enabled && motorConfig.rpm && motorConfig.polePairs)) {
            throw new Error('Park 变换需要 θ 通道，或先提供有效 BLDC RPM / 极对数。');
          }
          const base = get('ua')!;
          theta = new Float32Array(base.t.length);
          const fe = motorConfig.polePairs * motorConfig.rpm / 60;
          for (let i = 0; i < theta.length; i++) theta[i] = 2 * Math.PI * fe * base.t[i];
        }
        const r = computePark(alpha, beta, theta);
        const base = get('alpha')!;
        addChannel({
          ...base,
          id: `park_d_${Date.now()}`,
          name: 'Park d',
          v: r.d,
          color: COLORS[4],
          isMath: true,
          mathExpression: 'Park(alpha,beta,theta)',
          sourceChannelIds: [base.id, get('beta')!.id],
        });
        addChannel({
          ...base,
          id: `park_q_${Date.now()}`,
          name: 'Park q',
          v: r.q,
          color: COLORS[5],
          isMath: true,
          mathExpression: 'Park(alpha,beta,theta)',
          sourceChannelIds: [base.id, get('beta')!.id],
        });
      } else if (transformMode === 'power') {
        const ia = get('ia')?.v;
        const ib = get('ib')?.v;
        const ic = get('ic')?.v;
        if (!ia || !ib || !ic) throw new Error('瞬时功率需要 Ua/Ub/Uc + Ia/Ib/Ic 六个通道。');
        const p = computeInstantaneousPower(ua, ub, uc, ia, ib, ic);
        const base = get('ua')!;
        addChannel({
          ...base,
          id: `power_${Date.now()}`,
          name: 'P(t)',
          unit: 'W',
          v: p,
          color: COLORS[6],
          isMath: true,
          mathExpression: 'P=Ua*Ia+Ub*Ib+Uc*Ic',
          sourceChannelIds: [base.id, get('ub')!.id, get('uc')!.id, get('ia')!.id, get('ib')!.id, get('ic')!.id],
        });
      }
      showToast('变换通道已生成，结果来自当前实际波形输入。', 'success');
    } catch (err: any) {
      showToast(err?.message || '变换失败', 'error');
    }
  };

  const setCursorFromCanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!activeChannel || plotMode !== 'time') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const { start, end } = safeRange(view, activeChannel.t.length);
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left - 60) / Math.max(1, rect.width - 75)));
    const idx = Math.max(start, Math.min(end - 1, Math.round(start + frac * (end - start - 1))));
    const tt = activeChannel.t[idx];
    const vv = activeChannel.v[idx];
    setCursors((prev) => {
      const next = { ...prev, enabled: true };
      if (cursorTool === 'x') {
        if (prev.x1 === null || prev.x2 !== null) return { ...next, x1: tt, x2: null };
        return { ...next, x2: tt };
      }
      if (cursorTool === 'y') {
        if (prev.y1 === null || prev.y2 !== null) return { ...next, y1: vv, y2: null };
        return { ...next, y2: vv };
      }
      if (cursorTool === 'xy') {
        if (prev.x1 === null || prev.x2 !== null) return { ...next, x1: tt, x2: null, y1: vv, y2: null };
        return { ...next, x2: tt, y2: vv };
      }
      return next;
    });
  };

  const toggleVisibility = (id: string) => {
    setChannels((prev) => ({ ...prev, [id]: { ...prev[id], visible: !prev[id].visible } }));
  };

  const removeChannel = (id: string) => {
    if (!channels[id]?.isMath) return;
    setChannels((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setDrawOrder((prev) => prev.filter((x) => x !== id));
  };

  const exportCsv = () => {
    const visible = drawOrder.map((id) => channels[id]).filter((ch) => ch?.visible);
    if (!visible.length) return;
    const base = visible[0];
    const lines = ['time,' + visible.map((ch) => ch.name).join(',')];
    for (let i = 0; i < base.t.length; i++) {
      const row = [String(base.t[i])];
      for (const ch of visible) row.push(Number.isFinite(ch.v[i]) ? String(ch.v[i]) : '');
      lines.push(row.join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${fileName || 'waveform'}-visible.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${fileName || 'waveform'}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const saveSession = () => {
    if (!drawOrder.length) return;
    const tab = {
      id: 'main',
      fileName,
      channels,
      drawOrder,
      view,
      cursors,
      annotations: annotations.map((a) => ({ id: a.id, type: 'text' as const, x: a.x, y: a.y, text: a.text, channelId: a.channelId })),
      annotationMode,
      annotationsVisible: true,
      isOverlap: !separateView,
      plotMode,
      fftOptions,
      motorConfig,
      triggerConfig,
      measurementGate,
      separateView,
      selectedMeasurementChannelId: selectedChannelId,
      selectedFftChannelId: selectedFftChannelId,
    };
    const json = serializeSession([tab], 0);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${fileName || 'waveform'}.graphx.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const loadSession = async (file: File) => {
    try {
      const json = await file.text();
      const restored = deserializeSession(json);
      const tab = restored.tabs[restored.activeTabIndex || 0];
      if (!tab) throw new Error('会话文件里没有可恢复的波形页。');
      setChannels(buildInitialChannelMap(tab.channels));
      setDrawOrder(tab.drawOrder);
      setView(tab.view);
      setCursors(tab.cursors);
      setPlotMode(tab.plotMode);
      setFftOptions(tab.fftOptions);
      setMotorConfig(tab.motorConfig);
      setTriggerConfig(tab.triggerConfig);
      setMeasurementGate(tab.measurementGate);
      setSeparateView(tab.separateView);
      setSelectedChannelId(tab.selectedMeasurementChannelId || tab.drawOrder[0] || '');
      setSelectedFftChannelId(tab.selectedFftChannelId || tab.drawOrder[0] || '');
      setFileName(tab.fileName);
      setAnnotations(tab.annotations.map((a) => ({
        id: a.id,
        x: a.x,
        y: a.y,
        text: a.text || '',
        channelId: a.channelId || tab.drawOrder[0] || '',
      })));
      showToast('波形分析会话已恢复。', 'success');
    } catch (err: any) {
      showToast(err?.message || '会话恢复失败', 'error');
    }
  };

  const saveEngineeringEvidence = () => {
    if (!drawOrder.length) {
      showToast('请先导入波形。', 'info');
      return;
    }
    const normalizedRoles: ScopeRole[] = drawOrder.map((id) => roles[id] || 'none');
    if (!normalizedRoles.some((r) => r !== 'none')) {
      showToast('请至少给一个通道指定 Vbus / Vgs / Vds 角色。', 'info');
      return;
    }
    try {
      const selectedRolePairs = drawOrder
        .map((id) => ({ id, role: roles[id] || 'none' as ScopeRole }))
        .filter((x) => x.role !== 'none');
      const selectedRoles = selectedRolePairs.map((x) => x.role);
      const parsedScope = engineeringToScope(channels, drawOrder, roles);
      const fileLabel = fileName || 'waveform';
      const measurements = buildMeasurementsFromChannels(parsedScope, selectedRoles, fileLabel);
      const nowIso = new Date().toISOString();
      const stores = measurements.reports.map((report) =>
        toStoredWaveform(report, parsedScope, fileLabel, nowIso, scenarioId),
      );
      addWaveforms(stores);
      onApplyMeasured(measurements.values, measurements.provenance);
      measurements.warnings.forEach((w) => showToast(w, 'info'));
      showToast('当前波形已回填工程实测，并保留波形证据。', 'success');
    } catch (err: any) {
      showToast(err?.message || '工程证据回填失败', 'error');
    }
  };

  const addAnnotation = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!annotationMode || !activeChannel || plotMode !== 'time') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const { start, end } = safeRange(view, activeChannel.t.length);
    const fracX = Math.max(0, Math.min(1, (e.clientX - rect.left - 60) / Math.max(1, rect.width - 75)));
    const fracY = Math.max(0, Math.min(1, (e.clientY - rect.top - 22) / Math.max(1, rect.height - 56)));
    const idx = Math.max(start, Math.min(end - 1, Math.round(start + fracX * (end - start - 1))));
    const t = activeChannel.t[idx];
    const v = activeChannel.v[idx];
    const text = window.prompt('请输入波形标注内容', `${activeChannel.name} @ ${t} s, ${v} ${activeChannel.unit}`);
    if (!text) return;
    setAnnotations((prev) => [...prev, { id: `ann_${Date.now()}`, x: t, y: v, text, channelId: activeChannel.id }]);
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = rect.width;
    const h = rect.height;
    const p = { l: 60, r: 18, t: 22, b: 34 };
    const pw = Math.max(10, w - p.l - p.r);
    const ph = Math.max(10, h - p.t - p.b);

    ctx.fillStyle = '#07111f';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#0d1727';
    ctx.fillRect(p.l, p.t, pw, ph);

    ctx.strokeStyle = '#213149';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const x = p.l + (i / 10) * pw;
      ctx.beginPath(); ctx.moveTo(x, p.t); ctx.lineTo(x, p.t + ph); ctx.stroke();
    }
    for (let i = 0; i <= 8; i++) {
      const y = p.t + (i / 8) * ph;
      ctx.beginPath(); ctx.moveTo(p.l, y); ctx.lineTo(p.l + pw, y); ctx.stroke();
    }

    if (plotMode === 'frequency') {
      if (!fftChannel || !preparedFFT || 'error' in preparedFFT || !preparedFFT.frequencies?.length) return;
      const spectrum = preparedFFT;
      const minF = Math.max(0, view.fMin ?? 0);
      const nyq = spectrum.frequencies[spectrum.frequencies.length - 1];
      const maxF = Math.min(nyq, view.fMax ?? nyq);
      const values = fftOptions.scale === 'db' ? spectrum.dbValues : spectrum.magnitudes;
      const yMin = spectrum.yMin ?? (fftOptions.scale === 'db' ? -120 : 0);
      const yMax = spectrum.yMax ?? (fftOptions.scale === 'db' ? 20 : 1);
      const fSpan = Math.max(1, maxF - minF);
      const ySpan = Math.max(0.1, yMax - yMin);

      ctx.save();
      ctx.beginPath(); ctx.rect(p.l, p.t, pw, ph); ctx.clip();
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < spectrum.frequencies.length; i++) {
        const f = spectrum.frequencies[i];
        if (f < minF || f > maxF) continue;
        const x = p.l + ((f - minF) / fSpan) * pw;
        const y = p.t + ph - ((values[i] - yMin) / ySpan) * ph;
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = '#facc15';
      for (const marker of harmonicResult.markers) {
        if (marker.frequency < minF || marker.frequency > maxF) continue;
        const x = p.l + ((marker.frequency - minF) / fSpan) * pw;
        ctx.setLineDash([4, 4]); ctx.strokeStyle = '#facc15';
        ctx.beginPath(); ctx.moveTo(x, p.t); ctx.lineTo(x, p.t + ph); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillText(marker.label, Math.min(x + 4, p.l + pw - 90), p.t + 16);
      }

      ctx.fillStyle = '#fb7185';
      for (const peak of spectrum.peaks) {
        if (peak.frequency < minF || peak.frequency > maxF) continue;
        const value = fftOptions.scale === 'db' ? peak.db : peak.magnitude;
        const x = p.l + ((peak.frequency - minF) / fSpan) * pw;
        const y = p.t + ph - ((value - yMin) / ySpan) * ph;
        ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x - 5, y - 13); ctx.lineTo(x + 5, y - 13); ctx.closePath(); ctx.fill();
        const label = `${peak.frequency.toPrecision(5)} Hz`;
        ctx.fillText(label, Math.max(p.l + 4, Math.min(p.l + pw - 100, x + 4)), Math.max(p.t + 28, y - 16));
      }

      ctx.restore();
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(`${fftChannel.name} · Fs ${spectrum.sampleRate.toPrecision(5)} S/s · Δf ${spectrum.resolution.toPrecision(5)} Hz · N=${spectrum.fftSize}`, p.l + 8, p.t + 16);
      ctx.fillText(`${minF.toPrecision(5)} Hz`, p.l, h - 10);
      ctx.fillText(`${maxF.toPrecision(5)} Hz`, p.l + pw - 90, h - 10);
      return;
    }

    const visible = drawOrder.map((id) => channels[id]).filter((c) => c && c.visible);
    if (!visible.length) return;
    const { start, end } = safeRange(view, visible[0].t.length);
    const primaryT0 = visible[0].t[start];
    const primaryT1 = visible[0].t[end - 1];
    const spanT = Math.max(1e-30, primaryT1 - primaryT0);

    const drawChannel = (ch: WaveformChannel, top: number, height: number) => {
      const vMin = ch.vMin;
      const vMax = ch.vMax;
      const vSpan = Math.max(1e-30, vMax - vMin);
      ctx.strokeStyle = ch.color;
      ctx.lineWidth = ch.id === activeChannel?.id ? 1.8 : 1.15;
      ctx.beginPath();
      let started = false;
      for (let i = start; i < end; i++) {
        const val = ch.v[i];
        if (!Number.isFinite(val)) { started = false; continue; }
        const x = p.l + ((ch.t[i] - primaryT0) / spanT) * pw;
        const y = top + height - ((val - vMin) / vSpan) * height;
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (triggerConfig.enabled && triggerConfig.channelId === ch.id) {
        const y = top + height - ((triggerConfig.level - vMin) / vSpan) * height;
        if (y >= top && y <= top + height) {
          ctx.strokeStyle = '#facc15'; ctx.setLineDash([5, 4]);
          ctx.beginPath(); ctx.moveTo(p.l, y); ctx.lineTo(p.l + pw, y); ctx.stroke(); ctx.setLineDash([]);
        }
      }

      if (cursors.enabled && cursors.type && (cursors.type === 'y' || cursors.type === 'xy') && ch.id === (cursors.trackingChannel || activeChannel?.id)) {
        for (const yy of [cursors.y1, cursors.y2]) {
          if (yy === null) continue;
          const y = top + height - ((yy - vMin) / vSpan) * height;
          ctx.strokeStyle = '#4ade80'; ctx.setLineDash([6, 3]);
          ctx.beginPath(); ctx.moveTo(p.l, y); ctx.lineTo(p.l + pw, y); ctx.stroke(); ctx.setLineDash([]);
        }
      }

      if (separateView) {
        ctx.fillStyle = ch.color;
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillText(`${ch.name} · ${ch.vMin.toPrecision(5)} ~ ${ch.vMax.toPrecision(5)} ${ch.unit}`, p.l + 6, top + 12);
      }
    };

    if (separateView) {
      const laneH = ph / Math.max(1, visible.length);
      visible.forEach((ch, i) => {
        if (i > 0) {
          ctx.strokeStyle = '#1f2c3f';
          ctx.beginPath(); ctx.moveTo(p.l, p.t + i * laneH); ctx.lineTo(p.l + pw, p.t + i * laneH); ctx.stroke();
        }
        drawChannel(ch, p.t + i * laneH, laneH);
      });
    } else {
      drawChannel(activeChannel || visible[0], p.t, ph);
      visible.filter((ch) => ch.id !== activeChannel?.id).forEach((ch) => drawChannel(ch, p.t, ph));
    }

    if (cursors.enabled && cursors.type && (cursors.type === 'x' || cursors.type === 'xy')) {
      for (const xx of [cursors.x1, cursors.x2]) {
        if (xx === null) continue;
        const x = p.l + ((xx - primaryT0) / spanT) * pw;
        ctx.strokeStyle = '#a78bfa'; ctx.setLineDash([6, 3]);
        ctx.beginPath(); ctx.moveTo(x, p.t); ctx.lineTo(x, p.t + ph); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#ddd6fe'; ctx.font = '10px ui-monospace, monospace';
        ctx.fillText(`${formatTime(xx)}`, Math.min(x + 4, p.l + pw - 90), p.t + 14);
      }
    }

    if (annotations.length) {
      ctx.font = '10px ui-monospace, monospace';
      annotations.forEach((a) => {
        const x = p.l + ((a.x - primaryT0) / spanT) * pw;
        const ch = channels[a.channelId] || activeChannel;
        if (!ch) return;
        const y = p.t + ph - ((a.y - ch.vMin) / Math.max(1e-30, ch.vMax - ch.vMin)) * ph;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillText(a.text, Math.min(x + 6, p.l + pw - 180), Math.max(p.t + 26, y - 6));
      });
    }

    ctx.fillStyle = '#94a3b8'; ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(formatTime(primaryT0), p.l, h - 10);
    ctx.fillText(formatTime(primaryT1), p.l + pw - 90, h - 10);
  }, [
    channels, drawOrder, view, plotMode, activeChannel, fftChannel, preparedFFT, fftOptions, triggerConfig,
    cursors, separateView, annotations, harmonicResult,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    draw();
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isOpen, draw]);

  useEffect(() => {
    if (preparedFFT && 'error' in preparedFFT) setFftError(preparedFFT.error);
    else setFftError(null);
  }, [preparedFFT]);

  const wheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!activeChannel || plotMode !== 'time') return;
    e.preventDefault();
    const n = activeChannel.t.length;
    const span = Math.max(20, (view.endIndex || n) - view.startIndex);
    const factor = e.deltaY > 0 ? 1.25 : 0.8;
    const nextSpan = Math.min(n, Math.max(20, Math.round(span * factor)));
    const center = view.startIndex + span / 2;
    const nextStart = Math.max(0, Math.min(n - nextSpan, Math.round(center - nextSpan / 2)));
    setView((prev) => ({ ...prev, startIndex: nextStart, endIndex: nextStart + nextSpan }));
  };

  const pointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeChannel || plotMode !== 'time' || cursorTool || annotationMode) return;
    setDragState({ x: e.clientX, view });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragState || !activeChannel) return;
    const span = dragState.view.endIndex - dragState.view.startIndex;
    const delta = Math.round(((e.clientX - dragState.x) / Math.max(1, e.currentTarget.getBoundingClientRect().width)) * span);
    const nextStart = Math.max(0, Math.min(activeChannel.t.length - span, dragState.view.startIndex - delta));
    setView((prev) => ({ ...prev, startIndex: nextStart, endIndex: nextStart + span }));
  };

  const pointerUp = () => setDragState(null);

  const formatTime = (value: number) => {
    if (!Number.isFinite(value)) return '—';
    const abs = Math.abs(value);
    if (abs >= 1) return `${value.toFixed(3)} s`;
    if (abs >= 1e-3) return `${(value * 1e3).toFixed(3)} ms`;
    if (abs >= 1e-6) return `${(value * 1e6).toFixed(3)} µs`;
    if (abs >= 1e-9) return `${(value * 1e9).toFixed(3)} ns`;
    return `${value.toExponential(3)} s`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-sm p-2 sm:p-4">
      <div className="h-full w-full overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl flex flex-col">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <Activity className="w-5 h-5 text-amber-300" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-white text-sm">波形分析工作台</div>
              <div className="text-[10px] text-slate-400 truncate">WAVE-Test 完整分析能力 · 真实 t[] · 证据回填 · 不注入演示数据</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <label className="cursor-pointer rounded-md border border-blue-700/50 bg-blue-950/30 px-2.5 py-1.5 text-[11px] text-blue-300 flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" /> 导入 CSV/TXT/WFM
              <input type="file" accept=".csv,.txt,.wfm" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.currentTarget.value = ''; }} />
            </label>
            <label className="cursor-pointer rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[11px] text-slate-300 flex items-center gap-1.5">
              <FileArchive className="w-3.5 h-3.5" /> 打开会话
              <input type="file" accept=".json,.graphx.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadSession(f); e.currentTarget.value = ''; }} />
            </label>
            <button type="button" onClick={saveSession} disabled={!drawOrder.length} className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[11px] text-slate-300 disabled:opacity-40"><Save className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={exportPng} disabled={!drawOrder.length} className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[11px] text-slate-300 disabled:opacity-40"><Download className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={onClose} className="rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-slate-300"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="px-3 py-2 border-b border-slate-800 flex flex-wrap items-center gap-1.5 shrink-0">
          <button type="button" onClick={autoSet} disabled={!drawOrder.length} className="toolBtn"><Zap className="w-3.5 h-3.5" /> AutoSet</button>
          <button type="button" onClick={fit} disabled={!drawOrder.length} className="toolBtn"><Maximize2 className="w-3.5 h-3.5" /> Fit</button>
          <button type="button" onClick={() => setPlotMode('time')} className={plotMode === 'time' ? 'toolBtnActive' : 'toolBtn'}><Activity className="w-3.5 h-3.5" /> Waveform</button>
          <button type="button" onClick={() => setPlotMode('frequency')} className={plotMode === 'frequency' ? 'toolBtnActive' : 'toolBtn'}><BarChart3 className="w-3.5 h-3.5" /> Spectrum / FFT</button>
          <button type="button" onClick={() => setSeparateView((v) => !v)} className={separateView ? 'toolBtnActive' : 'toolBtn'}>Separate</button>
          <button type="button" onClick={() => setQualityVisible((v) => !v)} className="toolBtn">Quality</button>
          <button type="button" onClick={exportCsv} disabled={!drawOrder.length} className="toolBtn"><FileText className="w-3.5 h-3.5" /> CSV</button>
          <button type="button" onClick={() => setSettingsVisible((v) => !v)} className={settingsVisible ? 'toolBtnActive' : 'toolBtn'}><Settings2 className="w-3.5 h-3.5" /> Engineering</button>
          <span className="ml-auto text-[10px] text-slate-500 truncate">{fileName || '未导入'} · {activeChannel ? `${activeChannel.t.length.toLocaleString()} 点` : '等待波形'}</span>
        </div>

        {importError && <div className="mx-3 mt-2 rounded-md border border-red-700/40 bg-red-950/30 px-3 py-2 text-[11px] text-red-300">{importError}</div>}

        <div className="flex-1 min-h-0 flex flex-col xl:flex-row">
          <aside className="xl:w-[340px] border-b xl:border-b-0 xl:border-r border-slate-800 bg-slate-950/80 overflow-y-auto shrink-0">
            <div className="p-3 border-b border-slate-800">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Channels</div>
              {drawOrder.map((id, i) => {
                const ch = channels[id];
                if (!ch) return null;
                return (
                  <div key={id} className="flex items-center gap-1.5 mb-1.5">
                    <input type="checkbox" checked={ch.visible} onChange={() => toggleVisibility(id)} />
                    <button type="button" onClick={() => setSelectedChannelId(id)} className={`flex-1 text-left rounded-md px-2 py-1.5 text-[11px] ${id === activeChannel?.id ? 'bg-blue-600/15 border border-blue-500/30 text-blue-200' : 'bg-slate-900/60 border border-slate-800 text-slate-300'}`}>
                      CH{i + 1} · {ch.name}
                    </button>
                    {ch.isMath && <button type="button" onClick={() => removeChannel(id)} className="text-slate-500 hover:text-red-400">×</button>}
                  </div>
                );
              })}
            </div>

            <div className="p-3 border-b border-slate-800">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Measurement</div>
              <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
                <div className="metric">Max <b>{measurement?.max ?? '—'}</b></div>
                <div className="metric">Min <b>{measurement?.min ?? '—'}</b></div>
                <div className="metric">Vpp <b>{measurement?.vpp ?? '—'}</b></div>
                <div className="metric">RMS <b>{measurement?.rms ?? '—'}</b></div>
                <div className="metric">Freq <b>{measurement?.frequency ?? '—'} Hz</b></div>
                <div className="metric">Duty <b>{measurement?.dutyCycle ?? '—'} %</b></div>
                <div className="metric">Rise <b>{measurement?.riseTime ?? '—'} s</b></div>
                <div className="metric">Fall <b>{measurement?.fallTime ?? '—'} s</b></div>
              </div>
              <select value={measurementGate} onChange={(e) => setMeasurementGate(e.target.value as MeasurementGate)} className="field mt-2 w-full">
                <option value="view">测量范围：当前视图</option>
                <option value="cursors">测量范围：X1-X2</option>
                <option value="entire">测量范围：全波形</option>
              </select>
            </div>

            <div className="p-3 border-b border-slate-800">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Cursor</div>
              <div className="flex gap-1.5 mb-2">
                {(['x','y','xy'] as const).map((tool) => (
                  <button type="button" key={tool} onClick={() => { setCursorTool(tool); setCursors((prev) => ({ ...prev, enabled: true, type: tool, trackingChannel: activeChannel?.id || null })); }} className={cursorTool === tool ? 'toolBtnActive flex-1' : 'toolBtn flex-1'}>
                    <MousePointer2 className="inline w-3 h-3 mr-1" />{tool.toUpperCase()}
                  </button>
                ))}
                <button type="button" onClick={() => { setCursorTool(null); setCursors(DEFAULT_CURSOR); }} className="toolBtn">Clear</button>
              </div>
              <div className="text-[10px] text-slate-500">开启后点击波形设置 X/Y/XY 游标；X1/X2 可直接参与测量和 FFT gating。</div>
            </div>

            {settingsVisible && (
              <>
                <div className="p-3 border-b border-slate-800">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Import / Timebase</div>
                  <label className="text-[10px] text-slate-400 block mb-1">无时间列时的采样率 (S/s)</label>
                  <input className="field w-full mb-1.5" type="number" min="1" value={sampleRateDraft} onChange={(e) => setSampleRateDraft(e.target.value)} />
                  <div className="text-[10px] text-slate-500">有真实时间列时优先使用文件 t[]；只有无时间列才使用此值。</div>
                </div>

                <div className="p-3 border-b border-slate-800">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">FFT</div>
                  <select value={fftOptions.range} onChange={(e) => setFftOptions((o) => ({ ...o, range: e.target.value as FFTOptions['range'] }))} className="field w-full mb-1.5">
                    <option value="entire">Entire</option><option value="view">View</option><option value="cursors">Cursors</option>
                  </select>
                  <select value={fftOptions.window} onChange={(e) => setFftOptions((o) => ({ ...o, window: e.target.value as FFTWindowType }))} className="field w-full mb-1.5">
                    <option value="rectangular">Rectangular</option><option value="hann">Hann</option><option value="hamming">Hamming</option><option value="blackman-harris">Blackman-Harris</option>
                  </select>
                  <select value={fftOptions.scale} onChange={(e) => setFftOptions((o) => ({ ...o, scale: e.target.value as FFTOptions['scale'] }))} className="field w-full mb-1.5">
                    <option value="db">dB</option><option value="magnitude">Magnitude</option>
                  </select>
                  <select value={fftOptions.zeroPadding} onChange={(e) => setFftOptions((o) => ({ ...o, zeroPadding: Number(e.target.value) as FFTOptions['zeroPadding'] }))} className="field w-full mb-1.5">
                    <option value="1">Zero Padding ×1</option><option value="2">×2</option><option value="4">×4</option><option value="8">×8</option>
                  </select>
                  <label className="text-[10px] text-slate-400 flex items-center gap-2"><input type="checkbox" checked={fftOptions.removeDC} onChange={(e) => setFftOptions((o) => ({ ...o, removeDC: e.target.checked }))} /> Remove DC</label>
                  <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                    <input className="field" type="number" value={fftOptions.peakThresholdDb ?? -60} onChange={(e) => setFftOptions((o) => ({ ...o, peakThresholdDb: Number(e.target.value) }))} />
                    <input className="field" type="number" value={fftOptions.maxPeaks ?? 8} onChange={(e) => setFftOptions((o) => ({ ...o, maxPeaks: Number(e.target.value) }))} />
                  </div>
                  {fftError && <div className="text-[10px] text-red-300 mt-1">{fftError}</div>}
                  {plotMode === 'frequency' && preparedFFT && !('error' in preparedFFT) && (
                    <div className="mt-2 rounded-md border border-slate-800 bg-slate-900 p-2 text-[10px]">
                      <div>Fs: {preparedFFT.sampleRate} S/s</div>
                      <div>FFT N: {preparedFFT.fftSize}</div>
                      <div>Δf: {preparedFFT.resolution} Hz</div>
                      <div className="mt-1 text-slate-400">Peaks: {preparedFFT.peaks.map((p) => `${p.frequency.toPrecision(5)}Hz`).join(', ') || 'none'}</div>
                    </div>
                  )}
                </div>

                <div className="p-3 border-b border-slate-800">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Trigger</div>
                  <label className="text-[10px] text-slate-400 flex items-center gap-2 mb-1.5"><input type="checkbox" checked={triggerConfig.enabled} onChange={(e) => setTriggerConfig((x) => ({ ...x, enabled: e.target.checked, channelId: x.channelId || activeChannel?.id || '' }))} /> Enabled</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <select className="field" value={triggerConfig.channelId} onChange={(e) => setTriggerConfig((x) => ({ ...x, channelId: e.target.value }))}>
                      <option value="">选择通道</option>{drawOrder.map((id) => <option value={id} key={id}>{channels[id]?.name}</option>)}
                    </select>
                    <select className="field" value={triggerConfig.type} onChange={(e) => setTriggerConfig((x) => ({ ...x, type: e.target.value as 'rising' | 'falling' }))}><option value="rising">Rising</option><option value="falling">Falling</option></select>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                    <input className="field" type="number" value={triggerConfig.level} onChange={(e) => setTriggerConfig((x) => ({ ...x, level: Number(e.target.value) }))} />
                    <input className="field" type="number" value={triggerConfig.positionPercent} onChange={(e) => setTriggerConfig((x) => ({ ...x, positionPercent: Number(e.target.value) }))} />
                  </div>
                  <button type="button" className="toolBtn mt-1.5 w-full" onClick={applyTrigger}><Play className="inline w-3 h-3 mr-1" /> Apply Trigger</button>
                </div>

                <div className="p-3 border-b border-slate-800">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Math Channel</div>
                  <input className="field w-full mb-1.5" value={mathName} onChange={(e) => setMathName(e.target.value)} placeholder="Math 1" />
                  <input className="field w-full mb-1.5" value={mathExpression} onChange={(e) => setMathExpression(e.target.value)} placeholder="例如 CH1-CH2 / deriv(CH1)" />
                  <button type="button" className="toolBtn w-full" onClick={addMath}><PlusIcon /> Add Math</button>
                </div>

                <div className="p-3 border-b border-slate-800">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">BLDC Harmonics</div>
                  <label className="text-[10px] text-slate-400 flex items-center gap-2 mb-1.5"><input type="checkbox" checked={motorConfig.enabled} onChange={(e) => setMotorConfig((x) => ({ ...x, enabled: e.target.checked }))} /> Enable</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input className="field" type="number" placeholder="RPM" value={motorConfig.rpm ?? ''} onChange={(e) => setMotorConfig((x) => ({ ...x, rpm: e.target.value ? Number(e.target.value) : null }))} />
                    <input className="field" type="number" placeholder="Pole pairs" value={motorConfig.polePairs ?? ''} onChange={(e) => setMotorConfig((x) => ({ ...x, polePairs: e.target.value ? Number(e.target.value) : null }))} />
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1.5">{harmonicResult.statusMessage}</div>
                </div>

                <div className="p-3 border-b border-slate-800">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Clarke / Park / Power</div>
                  <select className="field w-full mb-1.5" value={transformMode} onChange={(e) => setTransformMode(e.target.value as typeof transformMode)}>
                    <option value="none">Select transform</option><option value="clarke">Clarke</option><option value="park">Park</option><option value="power">Instantaneous Power</option>
                  </select>
                  {transformMode !== 'none' && (
                    <div className="space-y-1">
                      {['ua','ub','uc','alpha','beta','theta','ia','ib','ic'].map((key) => (
                        <select key={key} className="field w-full" value={transformInputs[key] || ''} onChange={(e) => setTransformInputs((x) => ({ ...x, [key]: e.target.value }))}>
                          <option value="">{key.toUpperCase()}</option>{drawOrder.map((id) => <option value={id} key={id}>{channels[id]?.name}</option>)}
                        </select>
                      ))}
                      <button type="button" className="toolBtn w-full" onClick={applyTransform}><RefreshCw className="inline w-3 h-3 mr-1" /> Generate Transform</button>
                    </div>
                  )}
                </div>

                <div className="p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Engineering Role</div>
                  {drawOrder.map((id) => (
                    <div key={id} className="flex items-center gap-2 mb-1.5">
                      <span className="w-10 text-[10px] text-slate-500 truncate">{channels[id]?.name}</span>
                      <select className="field flex-1" value={roles[id] || 'none'} onChange={(e) => assignRole(id, e.target.value as ScopeRole)}>
                        <option value="none">不回填</option><option value="vbus">Vbus</option><option value="vgs">Vgs</option><option value="vds">Vds</option>
                      </select>
                    </div>
                  ))}
                  <button type="button" className="mt-2 w-full rounded-md border border-emerald-700/50 bg-emerald-950/30 px-3 py-2 text-[11px] font-semibold text-emerald-300" onClick={saveEngineeringEvidence}>
                    <CheckCircle2 className="inline w-3.5 h-3.5 mr-1" /> 保存为工程实测证据
                  </button>
                </div>
              </>
            )}

            {qualityVisible && sourceQuality && (
              <div className="p-3 border-t border-slate-800">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Sampling Quality</div>
                <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono">
                  <div className="metric">Status <b>{sourceQuality.qualityStatus}</b></div>
                  <div className="metric">Fs <b>{sourceQuality.sampleRate ?? '—'}</b></div>
                  <div className="metric">dt median <b>{sourceQuality.medianDt ?? '—'}</b></div>
                  <div className="metric">jitter max <b>{sourceQuality.jitterMax ?? '—'} %</b></div>
                  <div className="metric">invalid <b>{sourceQuality.invalidSamples}</b></div>
                  <div className="metric">gaps <b>{sourceQuality.gapCount}</b></div>
                </div>
                {!sourceQuality.isUniformSampling && <div className="mt-2 text-[10px] text-amber-300">自适应时间轴：显示保持原始 t[]；FFT 前自动线性重采样，不修改源波形。</div>}
              </div>
            )}
          </aside>

          <section className="flex-1 min-w-0 min-h-[420px] relative flex flex-col">
            <div className="flex-1 min-h-0 relative p-1">
              <canvas
                ref={canvasRef}
                className={`absolute inset-1 w-[calc(100%-8px)] h-[calc(100%-8px)] rounded-lg touch-none ${cursorTool || annotationMode ? 'cursor-crosshair' : 'cursor-grab'}`}
                onWheel={wheel}
                onPointerDown={pointerDown}
                onPointerMove={pointerMove}
                onPointerUp={pointerUp}
                onPointerCancel={pointerUp}
                onClick={(e) => { if (cursorTool) setCursorFromCanvas(e); if (annotationMode) addAnnotation(e); }}
              />
              {!drawOrder.length && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center text-slate-500">
                    <SlidersHorizontal className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <div className="text-sm">导入实际 CSV / TXT / WFM</div>
                    <div className="text-[10px] mt-1">这里没有演示波形。所有显示、测量、FFT 和变换都由当前导入数据生成。</div>
                  </div>
                </div>
              )}
            </div>
            <div className="h-9 shrink-0 border-t border-slate-800 px-3 flex items-center justify-between text-[10px] text-slate-500 font-mono">
              <span>{activeChannel ? `${activeChannel.name} · ${activeChannel.unit || '—'} · ${activeChannel.t.length.toLocaleString()} samples` : 'No waveform'}</span>
              <span>{cursors.x1 !== null && cursors.x2 !== null ? `ΔT=${formatTime(Math.abs(cursors.x2 - cursors.x1))}` : '—'}</span>
            </div>
          </section>
        </div>
      </div>
      <style>{`
        .toolBtn,.toolBtnActive{display:inline-flex;align-items:center;gap:5px;border:1px solid #334155;border-radius:6px;padding:6px 9px;font-size:11px;color:#cbd5e1;background:#0f172a}
        .toolBtnActive{border-color:#3b82f6;background:#172554;color:#bfdbfe}
        .toolBtn:disabled{opacity:.4}
        .field{border:1px solid #334155;border-radius:5px;background:#0f172a;color:#cbd5e1;padding:5px 7px;font-size:10px}
        .metric{border:1px solid #1e293b;background:#0f172a;border-radius:5px;padding:6px;color:#64748b}
        .metric b{display:block;color:#e2e8f0;margin-top:2px}
      `}</style>
    </div>
  );
};

const PlusIcon = () => <span className="text-base leading-none">＋</span>;

export default WaveformWorkbenchModal;
