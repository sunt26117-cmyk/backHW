import { IssueInput, ProjectContext } from '../types';
import { UnifiedEngineeringModel } from '../types/v4Models';

/**
 * 判断 issue.measuredValues 里是否存在这个 key 的原始数值（不管来源可信度）。
 *
 * 重要：这个函数只看 issue.measuredValues 原始数据，不看下面 extractUnifiedEngineeringModel()
 * 产出的 state.xxx —— state 里的数值为了兼容大量老代码，在结构化输入缺失时会走正则文本提取、
 * 再退化到写死的经验默认值（如 rotorInertiaKgm2 默认 0.0001），所以 state.xxx 永远不是
 * undefined，不能用来判断"这个量到底有没有真实依据"。
 *
 * 注意：这个函数不检查来源可信度——一个 TEXT_INFERRED（自由文本猜测）的值也会让它返回 true。
 * 「缺输入就必须 INSUFFICIENT_INPUT、禁止用低证据等级顶上」的判定，必须用下面的
 * isDecisionReadyValuePresent()，三个确定性引擎（bldcDeterministicEngine.ts /
 * robotJointDeterministicEngine.ts / thermalCascadeEngine.ts）现在都已统一改用它做输入完整性
 * 检查。这个函数保留给只需要"有没有原始数值"的场景（例如 isDecisionReadyValuePresent 自己内部、
 * 或 UI 上判断字段是否已填写以便高亮）。
 */
export function isMeasuredValuePresent(issue: IssueInput, key: string): boolean {
  const raw = issue.measuredValues?.[key];
  if (raw === undefined || raw === null || raw === '') return false;
  const num = Number(raw);
  return !isNaN(num);
}


/**
 * 判断某字段是否达到“可进入确定性工程判据”的证据等级。
 * TEXT_INFERRED / BENCHMARK / ASSUMPTION / CONTEXT 等只能作为候选或辅助信息，
 * 不得因为有一个数字就让确定性引擎误把它当作已验证输入。
 */
export function isDecisionReadyValuePresent(issue: IssueInput, key: string): boolean {
  if (!isMeasuredValuePresent(issue, key)) return false;
  const source = issue.measurementProvenance?.[key]?.source || issue.measuredValueSource || 'USER_MEASURED';
  return source === 'USER_MEASURED' || source === 'IMPORTED' || source === 'SPEC' || source === 'DATASHEET';
}

/**
 * 从 measuredValues 读一个「工程师真的填了」的数值 —— 全项目唯一的数值读取原语。
 *
 * 缺输入（undefined / null / 空串 / 纯空白 / 非数字 / 非有限值）一律 undefined；
 * **合法的 0 会被保留**（0A 电流、0℃ 环境温度都是真实测量值，不能被当成「没填」）。
 *
 * 与 isMeasuredValuePresent()/isDecisionReadyValuePresent() 的分工：本函数只回答「值是多少」，
 * 不回答「到底填没填」或「填的东西够不够格」。确定性引擎做「缺输入就必须 INSUFFICIENT_INPUT」的
 * 判定，必须用 isDecisionReadyValuePresent()（会排除 TEXT_INFERRED/BENCHMARK/ASSUMPTION 等低证据等级来源），
 * 不能只用 isMeasuredValuePresent()——后者只看「有没有数字」，不看来源可信度。
 *
 * 提取它的原因：此前 bldcMotorExpert.ts 自己写了一份 Number(...) 读数（对 ''/null 会返回 0，
 * 把「没填」当成「量到 0」），加 unifiedStateExtractor 内部两份、scenarioDerived 三件套，
 * 全项目有 4 套独立实现，各自可能漂移。
 */
export function readMeasuredNumber(
  measuredValues: Record<string, unknown> | undefined | null,
  key: string,
): number | undefined {
  const raw = measuredValues?.[key];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (text === '') return undefined;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

// 统一的状态提取器：只读 issue.measuredValues 结构化输入，不做正则文本兜底。
// 文本推断(如从"3800rpm"提取转速)由 pattern 引擎的 deriveBldcEvaluationInput 单独负责，
// 这里是确定性引擎的"结构化事实"来源，二者各司其职、不再各写一套正则互相分叉。
export function extractUnifiedEngineeringModel(context: ProjectContext, issue: IssueInput): UnifiedEngineeringModel {
  // [统一修复] 这里只读 issue.measuredValues 结构化输入，不再做正则文本兜底、也不再写死默认值。
  // 缺输入时返回 0 / undefined，由下游引擎用 isDecisionReadyValuePresent() 判断 INSUFFICIENT_INPUT。
  // 之前这里用正则 + 写死默认值(如 vbusNominal=12、cbusUf=1000、rpm=3000、rdsOn=2.5)，
  // 既和 pattern 引擎的 deriveBldcEvaluationInput 分叉，还会把自由文本里的"37.8V"误读成标称电压。
  // 两个包装都走同一个 readMeasuredNumber，区别只在「缺输入」如何表达：
  //   getNum         -> 0 哨兵（老代码大量依赖 state.xxx 是数字）
  //   getOptionalNum -> undefined（真正的「缺失」语义）
  const getNum = (key: string, _patterns?: RegExp[], _fallback?: number | null): number =>
    readMeasuredNumber(issue.measuredValues, key) ?? 0;

  const getOptionalNum = (key: string, _patterns?: RegExp[], _fallback?: number | null): number | undefined =>
    readMeasuredNumber(issue.measuredValues, key);

  // 多个候选 key 中取第一个「真的填了」的值（按顺序）。
  // 用途：同一个工程量在目录/历史版本里可能有两个 key（如 ambientTempC vs tAmbientC），
  // 用 || 会吞掉合法的 0 值（0℃ 是真实环境温度），所以必须判断「是否填写」而不是「是否非零」。
  const firstPresent = (...keys: string[]): number => {
    for (const k of keys) {
      const value = readMeasuredNumber(issue.measuredValues, k);
      if (value !== undefined) return value;
    }
    return 0;
  };

  return {
    project: {
      projectName: context.projectName,
      projectPhase: context.projectPhase,
      customer: context.customer,
      ecuType: context.ecuType,
      motorType: 'BLDC', // default or infer
      asil: context.asilLevel,
      sopDate: context.sopDate,
      milestone: context.nextMilestone,
    },
    electrical: {
      vbusNominal: getNum('busVoltageNominalV', [/Vbus\s*=\s*([0-9.]+)/i, /([0-9.]+)\s*V/i], 12),
      vbusMin: getNum('busVoltageMinV', [/Vbus_min\s*=\s*([0-9.]+)/i], 9),
      vbusMax: getNum('busVoltageMaxV', [/Vbus_max\s*=\s*([0-9.]+)/i], 16),
      currentNominal: getNum('currentNominalA', [/额定电流\s*([0-9.]+)/i], 10),
      currentPeak: getNum('currentPeakA', [/峰值电流\s*([0-9.]+)/i], 30),
      currentStall: getNum('currentStallA', [/堵转电流\s*([0-9.]+)/i], 50),
      maxRpm: getNum('rpm', [/转速\s*([0-9.]+)/i], 3000),
      pwmFrequencyKhz: getNum('pwmFreqKhz', [/PWM频率\s*([0-9.]+)/i, /([0-9.]+)\s*kHz/i], 20),
    },
    motor: {
      motorType: 'BLDC_INNER_ROTOR', // default or infer
      polePairs: getNum('polePairs', [/极对数\s*([0-9.]+)/i], 4),
      kv: getNum('kv', [/Kv\s*([0-9.]+)/i], 100),
      ke: getNum('keVkrpm', [/Ke\s*([0-9.]+)/i, /反电动势系数\s*([0-9.]+)/i], 5),
      j: getNum('rotorInertiaKgm2', [/转子惯量\s*([0-9.eE-]+)/i, /J_m\s*=\s*([0-9.eE-]+)/i], 0.0001),
      ratedTorqueNm: getNum('ratedTorqueNm', [/额定扭矩\s*([0-9.]+)/i], 1),
      peakTorqueNm: getNum('peakTorqueNm', [/峰值扭矩\s*([0-9.]+)/i], 3),
      maxRpm: getNum('rpm', [/转速\s*([0-9.]+)/i], 3000),
      sensorType: 'HALL',
    },
    powerStage: {
      mosfetPartNumber: issue.measuredValues?.mosfetPartNumber as string || 'Unknown_MOSFET',
      vdsRating: getNum('vdsRatingV', [/Vds耐压\s*([0-9.]+)\s*V/i, /Vds\s*=\s*([0-9.]+)\s*V/i, /([0-9.]+)\s*V耐压/i], 40),
      rdsOnMilliOhm: getNum('rdsOnMilliOhm', [/Rds\(on\)\s*([0-9.]+)\s*mΩ/i, /导通电阻\s*([0-9.]+)\s*mΩ/i], 2.5),
      vthMinV: getOptionalNum('vthMinV', [/Vth_min\s*=\s*([0-9.]+)\s*V/i, /阈值下限\s*([0-9.]+)\s*V/i]),
      dvdtVns: getOptionalNum('dvdtVns', [/dv\/dt\s*([0-9.]+)\s*V\/ns/i, /dvdt\s*([0-9.]+)\s*V\/ns/i]),
      cgdPf: getOptionalNum('cgdPf', [/Cgd\s*=\s*([0-9.]+)\s*pF/i, /米勒电容\s*([0-9.]+)\s*pF/i]),
      // Qg 有两个 key：DEVICE_SPEC 的 gateChargeQgNc 与 COMPONENT 的 qgNc —— 同一物理量、互为别名。
      qgNc: readMeasuredNumber(issue.measuredValues, 'qgNc') ?? readMeasuredNumber(issue.measuredValues, 'gateChargeQgNc') ?? getNum('qgNc', [/Qg\s*=\s*([0-9.]+)\s*nC/i], 50),
      qgdNc: getNum('qgdNc', [/Qgd\s*=\s*([0-9.]+)\s*nC/i, /米勒电荷\s*([0-9.]+)\s*nC/i], 15),
      qrrNc: getNum('qrrNc', [/Qrr\s*=\s*([0-9.]+)\s*nC/i], 100),
      gateDriverPartNumber: 'Unknown_Driver',
      rgOnOhm: getNum('rgOnOhm', [/Rg_on\s*([0-9.]+)\s*Ω/i], 10),
      rgOffOhm: getNum('rgOffOhm', [/Rg_off\s*([0-9.]+)\s*Ω/i, /关断电阻\s*([0-9.]+)\s*Ω/i, /Rg\s*=\s*([0-9.]+)\s*Ω/i], 2.2),
      cbusUf: getNum('cBusUf', [/Cbus\s*=\s*([0-9.]+)\s*uF/i, /母线电容\s*([0-9.]+)\s*uF/i], 1000),
      cbusEsrMilliOhm: getNum('cbusEsrMilliOhm', [/ESR\s*([0-9.]+)\s*mΩ/i], 10),
    },
    currentSense: {
      senseArchitecture: 'THREE_PHASE_LOW_SIDE',
      shuntResistanceMilliOhm: getNum('shuntResistanceMilliOhm', [/分流电阻\s*([0-9.]+)\s*mΩ/i, /Rsense\s*([0-9.]+)\s*mΩ/i], 1),
      gain: getNum('senseGain', [/运放增益\s*([0-9.]+)/i], 20),
      offsetMv: getNum('senseOffsetMv', [/偏置电压\s*([0-9.]+)\s*mV/i], 1650),
      bandwidthKhz: getNum('senseBandwidthKhz', [/采样带宽\s*([0-9.]+)\s*kHz/i], 1000),
      samplingFrequencyKhz: getNum('samplingFrequencyKhz', [/采样频率\s*([0-9.]+)\s*kHz/i], 20),
      adcResolutionBits: getNum('adcResolutionBits', [/ADC分辨率\s*([0-9.]+)\s*位/i], 12),
    },
    environment: {
      tAmbientC: firstPresent('ambientTempC', 'tAmbientC'), // 目录规范 key 是 ambientTempC
      tCaseC: getNum('tCaseC', [/焊盘温度(?:达|=)?\s*([0-9.]+)\s*℃/i, /T_pad\s*=\s*([0-9.]+)\s*℃/i, /Tc\s*=\s*([0-9.]+)\s*℃/i], 105),
      tjMaxC: getNum('tjMaxC', [/Tj_max\s*([0-9.]+)\s*℃/i], 150),
      cooling: 'NATURAL_CONVECTION',
      harnessLengthMeters: firstPresent('harnessLengthM', 'harnessLengthMeters'), // 目录规范 key 是 harnessLengthM
      connectorType: 'Unknown',
    },
    mechanical: {
      gearRatio: getNum('gearRatio', [/减速比\s*([0-9.]+)/i, /i=([0-9.]+)/i], 100),
      backlashArcmin: getNum('backlashArcmin', [/背隙\s*([0-9.]+)\s*arcmin/i, /([0-9.]+)\s*arcmin/i], 1.0),
      torsionalStiffnessNmPerRad: getNum('torsionalStiffnessNmPerRad', [/扭转刚度\s*([0-9.]+)\s*Nm\/rad/i], 10000),
      loadInertiaKgm2: getNum('loadInertiaKgm2', [/负载惯量\s*([0-9.eE-]+)\s*kgm2/i, /J_L\s*=\s*([0-9.eE-]+)/i], 0.1),
      requiredPositionAccuracyArcmin: getOptionalNum('requiredPositionAccuracyArcmin', [/±\s*([0-9.]+)\s*arcmin/i, /规格要求\s*([0-9.]+)\s*arcmin/i]),
      velocityLoopBandwidthHz: getOptionalNum('velocityLoopBandwidthHz', [/速度环带宽\s*([0-9.]+)\s*Hz/i]),
      regenPowerPeakW: getOptionalNum('regenPowerPeakW', [/峰值回馈功率\s*([0-9.]+)\s*W/i, /P_regen_peak\s*=\s*([0-9.]+)\s*W/i], undefined),
      brakingResistorRatedContinuousW: getOptionalNum('brakingResistorRatedContinuousW', [/泄放电阻连续额定功率\s*([0-9.]+)\s*W/i], undefined),
    },
    issue: {
      failurePhenomenon: issue.failurePhenomenon,
      testCondition: issue.testCondition,
      measuredData: issue.actualMeasurement,
      requirement: issue.requirement,
      engineeringConcern: issue.engineeringConcern,
      measuredValues: issue.measuredValues,
    }
  };
}
