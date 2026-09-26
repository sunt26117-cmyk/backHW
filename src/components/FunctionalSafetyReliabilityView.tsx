/**
 * 功能安全深度升级 (Section 5) 与 EMC / 可靠性 / 供应链 (Section 6)
 * 严格遵照 V4 规范：HARA 完整追溯链、FMEDA 度量与贡献拆分、FTA、电容 Arrhenius 寿命、二次源/PCN
 * 包含常驻强制免责声明
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Layers,
  Activity,
  Cpu,
  Zap,
  Clock,
  ExternalLink,
  ChevronDown,
  CheckCircle2,
  XCircle,
  FileText,
  Sliders,
} from 'lucide-react';
import {
  MANDATORY_SAFETY_DISCLAIMER,
  calculateFmedaMetrics,
  calculateCapacitorLife,
  compareSecondSource,
  evaluatePcn,
  evaluateEsdProtection,
  evaluateBciImmunity,
} from '../data/safetyReliabilityEngine';
import { ProjectContext, IssueInput, CopilotAnalysisResult } from '../types';
import { deriveSafetyTraceability, deriveFmedaRows, deriveFtaTree, deriveSafetyCollateral } from '../utils/scenarioDerived';
import { resolveEngineeringDomain } from '../utils/scenarioDomainEngine';
import { readMeasuredNumber } from '../utils/unifiedStateExtractor';
import { loadDevices } from '../utils/deviceLibrary';
import { buildSupplyPairFill, MEASURED_ONLY_COMPONENT_FIELDS } from '../utils/deviceSupplyPair';

const FSR_INPUT_KEYS = ['primaryRdsOnMilliOhm','secondaryRdsOnMilliOhm','primaryQgNc','secondaryQgNc','primaryQrrNc','secondaryQrrNc','primaryRthJcCPerW','secondaryRthJcCPerW','componentPartNumber','supplierName','pcnChangeDescription','esdLevelKv','esdPeakCurrentA','recoveryTimeMs','canErrorCount','affectedPort','tvsClampingVoltageV','harnessLengthM','bciInjectionMa','bciSensitiveFreqMhz','commonModeCurrentMa','bciNodeVoltageV','currentSenseErrorPct'] as const;

const cellInputCls = 'w-full bg-slate-900 text-white font-mono px-2 py-1 rounded border border-slate-700 text-xs focus:outline-none focus:border-blue-500';

function NumCell({ label, unit, value, onChange }: { label: string; unit?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="bg-slate-950 p-2 rounded border border-slate-800">
      <label className="text-[10px] text-slate-400 block mb-1">{label}{unit ? ' (' + unit + ')' : ''}</label>
      <input type="number" step="any" value={value} onChange={(e) => onChange(e.target.value)} className={cellInputCls} />
    </div>
  );
}

function TextCell({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="bg-slate-950 p-2 rounded border border-slate-800">
      <label className="text-[10px] text-slate-400 block mb-1">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={cellInputCls} />
    </div>
  );
}

interface FunctionalSafetyReliabilityViewProps {
  context: ProjectContext;
  issue: IssueInput;
  result: CopilotAnalysisResult | null;
  /** 把页内一键填入的结果**写回工程输入**（否则只在本页生效，分析与 Prompt 拿不到）。 */
  onApplyMeasuredValues?: (values: Record<string, number | string>, sourceLabel: string) => void;
  /** 初始子页（用于深链与渲染冒烟测试）；默认 HARA 追溯链。 */
  initialSubTab?: 'HARA_TRACE' | 'FMEDA' | 'FTA' | 'CAPACITOR_LIFE' | 'SECOND_SOURCE_PCN' | 'EMC_IMMUNITY';
}

export const FunctionalSafetyReliabilityView: React.FC<FunctionalSafetyReliabilityViewProps> = ({ context, issue, result, onApplyMeasuredValues, initialSubTab }) => {
  const [activeSubTab, setActiveSubTab] = useState<'HARA_TRACE' | 'FMEDA' | 'FTA' | 'CAPACITOR_LIFE' | 'SECOND_SOURCE_PCN' | 'EMC_IMMUNITY'>(initialSubTab ?? 'HARA_TRACE');

  const safetyTraceabilityChain = useMemo(() => deriveSafetyTraceability(context, issue, result), [context, issue, result]);
  const fmedaRows = useMemo(() => deriveFmedaRows(context, issue, result), [context, issue, result]);
  const ftaTree = useMemo(() => deriveFtaTree(context, issue, result), [context, issue, result]);
  const collateral = useMemo(() => deriveSafetyCollateral(context, issue, result), [context, issue, result]);

  // FMEDA 数据与计算
  const fmedaMetrics = calculateFmedaMetrics(fmedaRows, context.asilLevel);

  // 电容寿命交互参数：从当前典型工况读取温度/纹波信息，避免始终锁死在 85℃ / 3.2A 示例。
  const derivedCapDefaults = useMemo(() => {
    return collateral.capacitor;
  }, [issue]);

  const [capParams, setCapParams] = useState(derivedCapDefaults);
  React.useEffect(() => {
    setCapParams(derivedCapDefaults);
  }, [derivedCapDefaults]);

  // 二供/PCN/ESD/BCI 页内交互参数：优先从当前工况 measuredValues 同步，页内可直接改（实时重算）。
  const [fsrInputs, setFsrInputs] = useState<Record<string, string>>({});
  useEffect(() => {
    const mv = issue.measuredValues || {};
    const next: Record<string, string> = {};
    for (const k of FSR_INPUT_KEYS) {
      const v = mv[k];
      next[k] = v === undefined || v === null ? '' : String(v);
    }
    setFsrInputs(next);
  }, [issue.measuredValues]);
  const setF = (k: string) => (v: string) => setFsrInputs((p) => ({ ...p, [k]: v }));

  // ---------------------------------------------------------------- 器件库一键填入（一供 / 二供）
  // 8 个一供/二供字段 + COMPONENT 页里属于当前器件的字段，直接按规格书填，不再逐项手抄。
  // 每次渲染现取：若用 useMemo([activeSubTab])，导入新器件后下拉里看不到它（现场反馈"导入不了"的成因之一）。
  const deviceLibrary = loadDevices();
  // 初值直接取「当前绑定器件」，而不是等 effect 再补（否则会有一帧空白选中，容易让人以为是别的器件）。
  const [primaryDeviceId, setPrimaryDeviceId] = useState<string>(context.selectedDeviceId || '');
  const [secondaryDeviceId, setSecondaryDeviceId] = useState<string>('');
  const [supplyFillMessage, setSupplyFillMessage] = useState<string>('');
  useEffect(() => {
    // 一供默认跟随「当前绑定器件」；当前器件是唯一被物理引擎按工况插值使用的那个。
    setPrimaryDeviceId((prev) => prev || context.selectedDeviceId || '');
  }, [context.selectedDeviceId]);

  const applySupplyPairFill = () => {
    const primary = deviceLibrary.find((d) => d.id === primaryDeviceId);
    const secondary = deviceLibrary.find((d) => d.id === secondaryDeviceId);
    const fill = buildSupplyPairFill(primary, secondary);
    const written = Object.keys(fill.values);
    if (written.length === 0) {
      setSupplyFillMessage('器件库里没有可用参数：请先导入 / 选择器件。');
      return;
    }
    setFsrInputs((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(fill.values)) next[k] = String(v);
      return next;
    });
    const label = `器件库一键填入 · ${primary ? primary.partNumber || primary.id : '一供未选'} / ${secondary ? secondary.partNumber || secondary.id : '二供未选'}`;
    onApplyMeasuredValues?.(fill.values, label);
    setSupplyFillMessage(
      `已填入 ${written} 项（${label}）` +
        (fill.missing.length ? `；器件库未提供：${fill.missing.join('、')}` : '') +
        `；仍须实测输入：${MEASURED_ONLY_COMPONENT_FIELDS.join('、')}`,
    );
  };

  const capLifeResult = calculateCapacitorLife(
    capParams.nominalHours,
    capParams.ratedTempC,
    capParams.operatingTempC,
    capParams.rippleOperatingA,
    capParams.rippleRatedA
  );

  const safetyBenchmarks = useMemo(() => {
    const text = `${issue.requirement} ${issue.actualMeasurement} ${issue.testCondition} ${issue.failurePhenomenon}`;
    const domain = resolveEngineeringDomain(issue);
    const isHv = /(?:400V|800V|高压|400\s*V|800\s*V)/i.test(text);
    const isEmc = domain === 'EMC_BCI' || domain === 'EMC_ESD' || domain === 'EMC_RE_CE';
    const isBldc = domain === 'BLDC';
    // 统一读数：原实现挡了 undefined/''，但漏了 null（Number(null) === 0），也没挡纯空白。
    const num = (k: string): number | undefined => readMeasuredNumber(fsrInputs, k);
    const str = (k: string): string => fsrInputs[k] || '';
    const primary = isHv ? '当前高压主功率器件（Primary）' : isBldc ? '当前 3 相逆变功率管（Primary）' : `${context.productType} 关键器件（Primary）`;
    const secondary = isHv ? '候选高压二供器件（Secondary）' : isBldc ? '候选 Gate Driver / MOSFET 二供（Secondary）' : `${context.productType} 候选二供器件（Secondary）`;
    const source = compareSecondSource(primary, secondary, {
      primaryRdsOnMilliOhm: num('primaryRdsOnMilliOhm'),
      secondaryRdsOnMilliOhm: num('secondaryRdsOnMilliOhm'),
      primaryQgNc: num('primaryQgNc'),
      secondaryQgNc: num('secondaryQgNc'),
      primaryQrrNc: num('primaryQrrNc'),
      secondaryQrrNc: num('secondaryQrrNc'),
      primaryRthJcCPerW: num('primaryRthJcCPerW'),
      secondaryRthJcCPerW: num('secondaryRthJcCPerW'),
    });
    const pcn = evaluatePcn(domain === 'COMPONENT' ? 'PROCESS_NODE' : isEmc ? 'PACKAGE_FACILITY' : 'WAFER_FAB', {
      component: str('componentPartNumber') || context.productType || '',
      supplier: str('supplierName'),
      changeDescription: str('pcnChangeDescription'),
    });
    const requiredKv = (() => { const mm = text.match(/(?:±\s*)?(\d+(?:\.\d+)?)\s*kV/i); return mm ? Number(mm[1]) : undefined; })();
    const esd = evaluateEsdProtection({
      esdLevelKv: num('esdLevelKv'),
      esdPeakCurrentA: num('esdPeakCurrentA'),
      recoveryTimeMs: num('recoveryTimeMs'),
      canErrorCount: num('canErrorCount'),
      affectedPort: str('affectedPort'),
      tvsClampingVoltageV: num('tvsClampingVoltageV'),
      requiredEsdLevelKv: requiredKv,
      harnessLengthM: num('harnessLengthM'),
    });
    const bci = evaluateBciImmunity({
      bciInjectionMa: num('bciInjectionMa'),
      bciSensitiveFreqMhz: num('bciSensitiveFreqMhz'),
      recoveryTimeMs: num('recoveryTimeMs'),
      harnessLengthM: num('harnessLengthM'),
      commonModeCurrentMa: num('commonModeCurrentMa'),
      bciNodeVoltageV: num('bciNodeVoltageV'),
      canErrorCount: num('canErrorCount'),
      currentSenseErrorPct: num('currentSenseErrorPct'),
    });
    return {
      secondSource: source,
      pcn,
      esd,
      bci,
      provenanceNote: issue.measuredValueSource === 'BENCHMARK' ? '当前安全/可靠性页面中的演示数值仅用于验证界面与规则链，正式项目必须用器件 Safety Manual / FMEDA / 测试数据覆盖。' : '当前页面计算优先使用项目输入与当前域规则。',
    };
  }, [context, issue, result, fsrInputs]);

  const secondSourceResult = safetyBenchmarks.secondSource;
  const pcnResult = safetyBenchmarks.pcn;
  const esdResult = safetyBenchmarks.esd;
  const bciResult = safetyBenchmarks.bci;
  const scenarioEcu = `${context.ecuType} / ${context.productType}`;

  return (
    <div className="space-y-6">
      {/* 顶部常驻功能安全免责声明 (Section 5 强制要求) */}
      <div className="bg-amber-950/40 border border-amber-500/50 rounded-xl p-4 text-xs text-amber-200 flex items-start gap-3 shadow-md">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <div className="font-bold text-amber-300 text-sm mb-0.5">
            ISO 26262 车规功能安全与可靠性分析控制说明
          </div>
          <p className="leading-relaxed">
            <strong>免责声明：</strong>
            {MANDATORY_SAFETY_DISCLAIMER}
            所有计算参数均基于器件规格书与物理寿命模型推演，正式量产放行必须通过第三方权威实验室认可的独立安全用例评审。
          </p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-cyan-300 font-semibold">当前工况安全上下文</span>
          <span className="text-white">{context.projectName}</span>
          <span className="text-slate-400">{context.asilLevel} · {context.projectPhase} · {context.customer}</span>
        </div>
        <div className="mt-1 text-slate-400 line-clamp-2">{issue.failurePhenomenon || issue.engineeringConcern}</div>
        <div className="mt-1 text-slate-500">当前分析风险：{result?.riskRatings.overallRisk || '待生成'} {result?.riskRatings.overallRiskScore ?? ''}</div>
      </div>

      {/* 子导航 */}
      <div className="flex border-b border-slate-800 space-x-2 text-xs overflow-x-auto pb-2 scrollbar-none">
        {[
          { id: 'HARA_TRACE', label: '1. HARA 架构追溯链 (SG→FSR→TSR→HSR)' },
          { id: 'FMEDA', label: '2. FMEDA 失效率度量 (SPFM / LFM)' },
          { id: 'FTA', label: '3. 故障树分析 (FTA Top Event)' },
          { id: 'CAPACITOR_LIFE', label: '4. 电解电容 Arrhenius 寿命估算' },
          { id: 'SECOND_SOURCE_PCN', label: '5. 供应商二供与 PCN 评估' },
          { id: 'EMC_IMMUNITY', label: '6. ESD 防护与 BCI 大电流注入' },
        ].map((sub) => (
          <button
            key={sub.id}
            onClick={() => setActiveSubTab(sub.id as any)}
            className={`px-3 py-2 rounded-lg font-medium whitespace-nowrap transition cursor-pointer ${
              activeSubTab === sub.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {sub.label}
          </button>
        ))}
      </div>

      {/* 1. HARA 架构追溯链 */}
      {activeSubTab === 'HARA_TRACE' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-400" />
              <span>ISO 26262 功能安全追溯链 (Traceability Matrix)</span>
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              从顶层危害分析与风险评估 (HARA) 安全目标向下贯通，直至具体硬件器件与安全状态转移，不留任何功能安全孤岛。
            </p>

            <div className="space-y-4">
              {safetyTraceabilityChain.map((node, idx) => (
                <div
                  key={idx}
                  className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        {node.haraId}
                      </span>
                      <span className="text-xs font-semibold text-white">{node.safetyGoal}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {node.asil}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 font-mono">
                        证据: {node.evidence}
                      </span>
                    </div>
                  </div>

                  {/* 逐级展开 */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800">
                      <div className="text-[10px] text-slate-500 font-mono">功能安全需求 (FSR)</div>
                      <div className="text-slate-300 mt-1">{node.fsr}</div>
                    </div>
                    <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800">
                      <div className="text-[10px] text-slate-500 font-mono">技术安全需求 (TSR)</div>
                      <div className="text-slate-300 mt-1">{node.tsr}</div>
                    </div>
                    <div className="bg-slate-900/60 p-2.5 rounded border border-slate-800">
                      <div className="text-[10px] text-slate-500 font-mono">硬件安全需求 (HSR)</div>
                      <div className="text-slate-300 mt-1">{node.hsr}</div>
                    </div>
                  </div>

                  {/* 诊断与安全状态 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-2 border-t border-slate-800/60 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 block">目标硬件组件</span>
                      <span className="text-slate-300 font-mono">{node.hardwareComponent}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">诊断覆盖率 (DC)</span>
                      <span className="text-emerald-400 font-mono font-bold">{node.diagnosticCoveragePct}%</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">故障容错时间间隔 (FHTI)</span>
                      <span className="text-cyan-300 font-mono font-bold">&le; {node.faultHandlingTimeIntervalMs} ms</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">规定安全状态 (Safe State)</span>
                      <span className="text-amber-300">{node.safeState}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2. FMEDA 失效率度量 */}
      {activeSubTab === 'FMEDA' && (
        <div className="space-y-4">
          {/* 指标卡片 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400">单点故障度量 (SPFM)</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold font-mono text-emerald-400">{fmedaMetrics.spfmPct}%</span>
                <span className="text-xs text-slate-500">目标: &ge; {fmedaMetrics.spfmTargetPct}%</span>
              </div>
              <div className="mt-2 text-[11px] text-emerald-300 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> 目标等级 {context.asilLevel} 的内部筛查门限
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400">潜伏故障度量 (LFM)</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold font-mono text-cyan-400">{fmedaMetrics.lfmPct}%</span>
                <span className="text-xs text-slate-500">目标: &ge; {fmedaMetrics.lfmTargetPct}%</span>
              </div>
              <div className="mt-2 text-[11px] text-cyan-300 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> 目标等级 {context.asilLevel} 的内部筛查门限
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400">单点失效贡献占比</div>
              <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
                {fmedaMetrics.contributions.singlePointFailurePct}%
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                按当前工况风险与故障覆盖贡献进行场景筛查
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400">残余故障贡献占比</div>
              <div className="text-2xl font-bold font-mono text-blue-400 mt-1">
                {fmedaMetrics.contributions.residualFailurePct}%
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                当前工况的诊断与残余故障贡献
              </div>
            </div>
          </div>

          {/* FMEDA 数据表格 */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 overflow-x-auto">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              功率级与驱动核心元件 FMEDA 详细拆分表 (FIT = 10^-9 / h)
            </h3>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono bg-slate-950/60">
                  <th className="p-2.5">硬件组件</th>
                  <th className="p-2.5">失效模式</th>
                  <th className="p-2.5 text-right">总 FIT</th>
                  <th className="p-2.5 text-right">DC (%)</th>
                  <th className="p-2.5 text-right">SPF (FIT)</th>
                  <th className="p-2.5 text-right">RF (FIT)</th>
                  <th className="p-2.5 text-right">LF (FIT)</th>
                  <th className="p-2.5">数据源与证据类型</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {fmedaRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40">
                    <td className="p-2.5 font-medium text-white">{row.component}</td>
                    <td className="p-2.5 text-slate-300">{row.failureMode}</td>
                    <td className="p-2.5 text-right font-mono text-cyan-300">{row.lambdaTotalFit}</td>
                    <td className="p-2.5 text-right font-mono text-emerald-400 font-bold">{row.dcPct}%</td>
                    <td className="p-2.5 text-right font-mono text-amber-300">{row.lambdaSpfFit}</td>
                    <td className="p-2.5 text-right font-mono text-purple-300">{row.lambdaRfFit}</td>
                    <td className="p-2.5 text-right font-mono text-slate-400">{row.lambdaLfFit}</td>
                    <td className="p-2.5 text-[11px] text-slate-400">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 mr-1.5 font-mono">
                        {row.evidence}
                      </span>
                      <span>{row.evidenceSource}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. FTA 故障树分析 */}
      {activeSubTab === 'FTA' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-400" />
                <span>{scenarioEcu} · 当前工况 FTA 故障树 (Top Event Fault Tree)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                严谨的布尔逻辑门 (OR/AND) 展开，展示从顶层灾难性事件到基本事件的传递机制与抑制对策。
              </p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono">
              Top Event: Shoot-Through
            </span>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-4">
            {/* 顶事件 */}
            <div className="border border-red-500/50 bg-red-950/30 p-3 rounded-lg flex items-center justify-between">
              <span className="font-bold text-xs text-red-300">{ftaTree.name}</span>
              <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 font-mono text-[10px] font-bold">
                逻辑门: {ftaTree.gateType}
              </span>
            </div>

            {/* 中间事件 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-4 border-l-2 border-slate-800">
              {ftaTree.children?.map((gate) => (
                <div key={gate.id} className="bg-slate-900 p-3 rounded-lg border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                    <span className="text-xs font-semibold text-blue-300">{gate.name}</span>
                    <span className="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 text-[10px] font-mono">
                      {gate.gateType} 门
                    </span>
                  </div>

                  {/* 底事件 */}
                  <div className="space-y-2 pt-1">
                    {gate.children?.map((be) => (
                      <div key={be.id} className="bg-slate-950 p-2 rounded text-xs border border-slate-800/80">
                        <div className="text-white font-medium flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                          <span>{be.name}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1 grid grid-cols-2 gap-1">
                          <div>检测: {be.detection}</div>
                          <div>对策: <span className="text-emerald-400">{be.mitigation}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. 电解电容 Arrhenius 寿命估算 */}
      {activeSubTab === 'CAPACITOR_LIFE' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  <span>母线电解电容 Arrhenius 寿命加速模型估算</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  基于阿伦尼乌斯结温每降低 10℃ 寿命翻倍规律，并叠加纹波自热效应。
                </p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold">
                {capLifeResult.confidenceTag}
              </span>
            </div>

            {/* 参数调节 */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5 text-xs">
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <label className="text-[10px] text-slate-400 block mb-1">标称寿命 (h)</label>
                <input
                  type="number"
                  value={capParams.nominalHours}
                  onChange={(e) => setCapParams({ ...capParams, nominalHours: Number(e.target.value) })}
                  className="w-full bg-slate-900 text-white font-mono px-2 py-1 rounded border border-slate-700"
                />
              </div>
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <label className="text-[10px] text-slate-400 block mb-1">额定温度 (℃)</label>
                <input
                  type="number"
                  value={capParams.ratedTempC}
                  onChange={(e) => setCapParams({ ...capParams, ratedTempC: Number(e.target.value) })}
                  className="w-full bg-slate-900 text-white font-mono px-2 py-1 rounded border border-slate-700"
                />
              </div>
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <label className="text-[10px] text-slate-400 block mb-1">工作环境温 (℃)</label>
                <input
                  type="number"
                  value={capParams.operatingTempC}
                  onChange={(e) => setCapParams({ ...capParams, operatingTempC: Number(e.target.value) })}
                  className="w-full bg-slate-900 text-white font-mono px-2 py-1 rounded border border-slate-700"
                />
              </div>
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <label className="text-[10px] text-slate-400 block mb-1">工作纹波电流 (A)</label>
                <input
                  type="number"
                  step="0.1"
                  value={capParams.rippleOperatingA}
                  onChange={(e) => setCapParams({ ...capParams, rippleOperatingA: Number(e.target.value) })}
                  className="w-full bg-slate-900 text-white font-mono px-2 py-1 rounded border border-slate-700"
                />
              </div>
              <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                <label className="text-[10px] text-slate-400 block mb-1">额定允许纹波 (A)</label>
                <input
                  type="number"
                  step="0.1"
                  value={capParams.rippleRatedA}
                  onChange={(e) => setCapParams({ ...capParams, rippleRatedA: Number(e.target.value) })}
                  className="w-full bg-slate-900 text-white font-mono px-2 py-1 rounded border border-slate-700"
                />
              </div>
            </div>

            {/* 输出卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="text-xs text-slate-400">内部核心热点估算结温</div>
                <div className="text-2xl font-mono font-bold text-amber-400 mt-1">
                  {capLifeResult.hotSpotTemperatureC} ℃
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  自发热温升: +{(capLifeResult.hotSpotTemperatureC - capParams.operatingTempC).toFixed(1)} ℃
                </div>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="text-xs text-slate-400">模型推演寿命 (小时)</div>
                <div className="text-2xl font-mono font-bold text-emerald-400 mt-1">
                  {capLifeResult.estimatedLifeHours.toLocaleString()} h
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  折合约 {(capLifeResult.estimatedLifeHours / 8760).toFixed(1)} 年 (按全年连续通电)
                </div>
              </div>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="text-xs text-slate-400">车规设计目标裕量</div>
                <div className={`text-2xl font-mono font-bold mt-1 ${capLifeResult.marginHours >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {capLifeResult.marginHours >= 0 ? `+${capLifeResult.marginHours.toLocaleString()} h` : `${capLifeResult.marginHours.toLocaleString()} h`}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  车规基准 15,000h (约 15 年正常行驶)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. 供应商二供与 PCN 评估 */}
      {activeSubTab === 'SECOND_SOURCE_PCN' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200 mb-3"><Sliders className="w-4 h-4 text-blue-400" /> 二供 / PCN 参数（页内直接输入，实时重算）</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              <NumCell label="一供 Rds(on)" unit="mΩ" value={fsrInputs.primaryRdsOnMilliOhm || ''} onChange={setF('primaryRdsOnMilliOhm')} />
              <NumCell label="二供 Rds(on)" unit="mΩ" value={fsrInputs.secondaryRdsOnMilliOhm || ''} onChange={setF('secondaryRdsOnMilliOhm')} />
              <NumCell label="一供 Qg" unit="nC" value={fsrInputs.primaryQgNc || ''} onChange={setF('primaryQgNc')} />
              <NumCell label="二供 Qg" unit="nC" value={fsrInputs.secondaryQgNc || ''} onChange={setF('secondaryQgNc')} />
              <NumCell label="一供 Qrr" unit="nC" value={fsrInputs.primaryQrrNc || ''} onChange={setF('primaryQrrNc')} />
              <NumCell label="二供 Qrr" unit="nC" value={fsrInputs.secondaryQrrNc || ''} onChange={setF('secondaryQrrNc')} />
              <NumCell label="一供 Rth(j-c)" unit="℃/W" value={fsrInputs.primaryRthJcCPerW || ''} onChange={setF('primaryRthJcCPerW')} />
              <NumCell label="二供 Rth(j-c)" unit="℃/W" value={fsrInputs.secondaryRthJcCPerW || ''} onChange={setF('secondaryRthJcCPerW')} />
            </div>
            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-2 space-y-2">
              <div className="text-[10px] text-slate-400">
                从器件库一键填入（一供默认 = 当前绑定器件；映射沿用器件字段表，不手抄）
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  value={primaryDeviceId}
                  onChange={(e) => setPrimaryDeviceId(e.target.value)}
                  className={cellInputCls}
                  aria-label="一供器件"
                >
                  <option value="">一供：请选择器件</option>
                  {deviceLibrary.map((d) => (
                    <option key={d.id} value={d.id}>
                      {(d.partNumber || d.id) + (d.id === context.selectedDeviceId ? '（当前器件）' : '')}
                    </option>
                  ))}
                </select>
                <select
                  value={secondaryDeviceId}
                  onChange={(e) => setSecondaryDeviceId(e.target.value)}
                  className={cellInputCls}
                  aria-label="二供器件"
                >
                  <option value="">二供：请选择器件</option>
                  {deviceLibrary.map((d) => (
                    <option key={d.id} value={d.id}>{d.partNumber || d.id}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={applySupplyPairFill}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1 rounded"
                >
                  从器件库填入
                </button>
              </div>
              {supplyFillMessage && (
                <div className="text-[10px] text-amber-300 leading-relaxed">{supplyFillMessage}</div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
              <TextCell label="器件型号" value={fsrInputs.componentPartNumber || ''} onChange={setF('componentPartNumber')} />
              <TextCell label="供应商" value={fsrInputs.supplierName || ''} onChange={setF('supplierName')} />
              <TextCell label="PCN变更内容" value={fsrInputs.pcnChangeDescription || ''} onChange={setF('pcnChangeDescription')} />
            </div>
            <div className="text-[10px] text-slate-500 mt-2">未填项显示「待输入」；页内改动即时重算，并会随「1. 统一工程输入」回填的参数自动同步。</div>
          </div>
          {/* 二供多维等价性对比 */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-blue-400" />
                <span>供应商第二来源多维等价性评估 (Second Source)</span>
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold">
                {secondSourceResult.overallVerdict}
              </span>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs space-y-2">
              <div className="flex justify-between text-slate-400 font-mono">
                <span>首选: {secondSourceResult.primaryPart}</span>
                <span>二供: {secondSourceResult.secondSourcePart}</span>
              </div>
              <div className="border-t border-slate-800/80 pt-2 space-y-1 text-slate-300">
                <div>• 电气匹配: {secondSourceResult.isElectricalInputProvided ? ('Vds/Id 一致，Rds(on) ' + (secondSourceResult.electricalEquivalence.rdsOnDeltaPct > 0 ? '+' : '') + secondSourceResult.electricalEquivalence.rdsOnDeltaPct + '%，Qrr ' + (secondSourceResult.electricalEquivalence.qrrDeltaPct > 0 ? '+' : '') + secondSourceResult.electricalEquivalence.qrrDeltaPct + '%') : 'Vds/Id 一致，Rds(on)/Qg/Qrr 差异待输入（在“实测参数回填”中填两只器件参数后计算）'}</div>
                <div>• 开关影响: {secondSourceResult.switchingEquivalence.ringingRisk}</div>
                <div>• EMC 与安全: {secondSourceResult.safetyEmcEquivalence.emcRisk}</div>
              </div>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div className="text-xs font-bold text-red-300 mb-1.5">必须补充的回归测试项 (Mandatory Retests):</div>
              <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
                {secondSourceResult.retestRequired.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* PCN 变更评估 */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-white flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-purple-400" />
                <span>PCN 跨晶圆厂工艺变更回归评估 (PCN Evaluator)</span>
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-mono font-bold">
                {pcnResult.regressionVerdict}
              </span>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs space-y-2">
              <div className="text-slate-200 font-medium">{pcnResult.changeDescription}</div>
              <div className="text-slate-400">
                <strong>导致失效的前序试验数据：</strong>
                <ul className="list-disc list-inside mt-1 space-y-0.5 text-slate-300">
                  {pcnResult.invalidatedPreviousTests.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
              <div className="text-xs font-bold text-blue-300 mb-1.5">闭环处置要求：</div>
              <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
                {pcnResult.recommendedActions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 6. ESD 防护与 BCI 大电流注入 */}
      {activeSubTab === 'EMC_IMMUNITY' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200 mb-3"><Sliders className="w-4 h-4 text-emerald-400" /> ESD / BCI 参数（页内直接输入，实时重算）</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <NumCell label="ESD放电等级" unit="kV" value={fsrInputs.esdLevelKv || ''} onChange={setF('esdLevelKv')} />
              <NumCell label="TVS钳位残压" unit="V" value={fsrInputs.tvsClampingVoltageV || ''} onChange={setF('tvsClampingVoltageV')} />
              <TextCell label="受扰端口" value={fsrInputs.affectedPort || ''} onChange={setF('affectedPort')} />
              <NumCell label="BCI注入电流" unit="mA" value={fsrInputs.bciInjectionMa || ''} onChange={setF('bciInjectionMa')} />
              <NumCell label="敏感频点" unit="MHz" value={fsrInputs.bciSensitiveFreqMhz || ''} onChange={setF('bciSensitiveFreqMhz')} />
              <NumCell label="线束长度" unit="m" value={fsrInputs.harnessLengthM || ''} onChange={setF('harnessLengthM')} />
              <NumCell label="恢复时间" unit="ms" value={fsrInputs.recoveryTimeMs || ''} onChange={setF('recoveryTimeMs')} />
            </div>
            <div className="text-[10px] text-slate-500 mt-2">未填项显示「待输入」；页内改动即时重算，并会随「1. 统一工程输入」回填的参数自动同步。</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <h2 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>ESD 静电放电释放路径分析 (ISO 10605)</span>
            </h2>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs space-y-2 text-slate-300">
              <div>• 释放路径: {esdResult.dischargePath}</div>
              <div>• TVS 型号与残压: <strong className="text-cyan-300">{esdResult.tvsModel}</strong>{esdResult.clampingVoltageV > 0 ? (' (钳位残压 ' + esdResult.clampingVoltageV + 'V)') : ' (钳位残压待输入)'}</div>
              <div>• 敏感引脚暴露: {esdResult.sensitiveIcExposed}</div>
              <div>• 测试等级标准: <span className="text-emerald-400 font-mono">{esdResult.testStandardRequirement}</span></div>
              <div>• 判定: <span className={esdResult.status === 'PASS' ? 'text-emerald-400' : esdResult.status === 'CRITICAL' ? 'text-red-400' : 'text-amber-400'}>{esdResult.status}{esdResult.isRequirementUnknown ? '（缺输入，待补实测放电等级）' : ''}</span></div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
            <h2 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>BCI 大电流注入共模抗扰度 (ISO 11452-4)</span>
            </h2>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs space-y-2 text-slate-300">
              <div>• 易感频段: <strong className="text-amber-300">{bciResult.susceptibleBandMhz}</strong></div>
              <div>• 建议注入点: {bciResult.injectionPointRecommended}</div>
              <div>• 监测点: {bciResult.measurementPointRecommended}</div>
              <div>• 滤波措施: {(Array.isArray(bciResult.filteringMeasures) ? bciResult.filteringMeasures : typeof bciResult.filteringMeasures === 'string' ? [bciResult.filteringMeasures] : []).join('；')}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
