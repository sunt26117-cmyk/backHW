import { downsampleMinMax, buildMarkers, WaveformMarker, ChannelReport, ParsedScope } from './oscilloscopeImport';

/** 已导入示波器波形的本地留存（降采样后的曲线 + 指标标记），用于导入之后回看“这个数是怎么来的”。 */
export interface StoredWaveform {
  id: string; // = MeasurementProvenance.evidenceId
  fileName: string;
  channelName: string;
  role: string;
  savedAt: string;
  scenarioId?: string;
  time: number[];
  samples: number[];
  markers: WaveformMarker[];
  metrics: {
    peak: number; valley: number; dvDtMaxVns: number; dvDtMethod?: string;
    ringingHz: number | null; baselineLevel?: number; warnings: string[];
  };
}

export interface KeyValueStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const KEY = 'ecu-copilot:waveforms:v1';
export const MAX_STORED_WAVEFORMS = 8;
export const STORED_WAVEFORM_POINTS = 1200;

const defaultStorage = (): KeyValueStorage | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

export function toStoredWaveform(report: ChannelReport, parsed: ParsedScope, fileName: string, savedAt: string, scenarioId?: string): StoredWaveform {
  const raw = parsed.channels[report.channelIndex].samples;
  const markers = buildMarkers(parsed.time, raw, report.metrics);
  const ds = downsampleMinMax(parsed.time, raw, STORED_WAVEFORM_POINTS);
  const m = report.metrics;
  return {
    id: report.evidenceId,
    fileName,
    channelName: report.channelName,
    role: report.role,
    savedAt,
    scenarioId,
    time: ds.time,
    samples: ds.samples,
    markers,
    metrics: {
      peak: m.peak, valley: m.valley, dvDtMaxVns: m.dvDtMaxVns, dvDtMethod: m.dvDtMethod,
      ringingHz: m.ringingHz, baselineLevel: m.baselineLevel, warnings: m.warnings || [],
    },
  };
}

export function loadWaveforms(storage: KeyValueStorage | null = defaultStorage()): StoredWaveform[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? (list as StoredWaveform[]) : [];
  } catch {
    return [];
  }
}

/** 写入失败(配额)时逐条丢弃最旧的重试；始终返回最终保存下来的列表。 */
function persist(list: StoredWaveform[], storage: KeyValueStorage | null): StoredWaveform[] {
  let cur = list.slice(-MAX_STORED_WAVEFORMS);
  if (!storage) return cur;
  while (cur.length > 0) {
    try {
      storage.setItem(KEY, JSON.stringify(cur));
      return cur;
    } catch {
      cur = cur.slice(1);
    }
  }
  return cur;
}

export function addWaveforms(items: StoredWaveform[], storage: KeyValueStorage | null = defaultStorage()): StoredWaveform[] {
  const existing = loadWaveforms(storage).filter((w) => !items.some((n) => n.id === w.id));
  return persist([...existing, ...items], storage);
}

export function removeWaveform(id: string, storage: KeyValueStorage | null = defaultStorage()): StoredWaveform[] {
  return persist(loadWaveforms(storage).filter((w) => w.id !== id), storage);
}
