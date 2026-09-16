import { IssueInput, ProjectContext } from '../types';
import { UnifiedEngineeringModel } from '../types/v4Models';

// 正则提取辅助函数
function extractNumber(text: string, patterns: RegExp[], fallback: number | null = null): number | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) {
      const val = parseFloat(m[1]);
      if (!isNaN(val)) return val;
    }
  }
  return fallback;
}

// 统一的状态提取器
export function extractUnifiedEngineeringModel(context: ProjectContext, issue: IssueInput): UnifiedEngineeringModel {
  const fullText = [
    issue.requirement,
    issue.actualMeasurement,
    issue.testCondition,
    issue.environment,
    issue.failurePhenomenon,
    issue.engineeringConcern,
  ].join('\n');

  // Helper function to safely get from measuredValues or fallback to regex extraction
  const getNum = (key: string, patterns: RegExp[], fallback: number | null = null): number => {
    const raw = issue.measuredValues?.[key];
    if (raw !== undefined && raw !== null && raw !== '') {
      const parsed = Number(raw);
      if (!isNaN(parsed)) return parsed;
    }
    // If structured input is missing, attempt to extract from text
    const extracted = extractNumber(fullText, patterns, fallback);
    return extracted !== null ? extracted : (fallback !== null ? fallback : 0); // defaulting to 0 for strict types, though missing values will fail checks later
  };
  
  const getOptionalNum = (key: string, patterns: RegExp[], fallback: number | null = null): number | undefined => {
    const raw = issue.measuredValues?.[key];
    if (raw !== undefined && raw !== null && raw !== '') {
      const parsed = Number(raw);
      if (!isNaN(parsed)) return parsed;
    }
    const extracted = extractNumber(fullText, patterns, fallback);
    return extracted !== null ? extracted : undefined;
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
      qgNc: getNum('qgNc', [/Qg\s*=\s*([0-9.]+)\s*nC/i], 50),
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
      tAmbientC: getNum('tAmbientC', [/环温\s*([0-9.]+)\s*℃/i, /环境温度\s*([0-9.]+)\s*℃/i, /Ta\s*=\s*([0-9.]+)\s*℃/i], 85),
      tCaseC: getNum('tCaseC', [/焊盘温度(?:达|=)?\s*([0-9.]+)\s*℃/i, /T_pad\s*=\s*([0-9.]+)\s*℃/i, /Tc\s*=\s*([0-9.]+)\s*℃/i], 105),
      tjMaxC: getNum('tjMaxC', [/Tj_max\s*([0-9.]+)\s*℃/i], 150),
      cooling: 'NATURAL_CONVECTION',
      harnessLengthMeters: getNum('harnessLengthMeters', [/线束长度\s*([0-9.]+)\s*m/i], 1.5),
      connectorType: 'Unknown',
    },
    mechanical: {
      gearRatio: getNum('gearRatio', [/减速比\s*([0-9.]+)/i, /i=([0-9.]+)/i], 100),
      backlashArcmin: getNum('backlashArcmin', [/背隙\s*([0-9.]+)\s*arcmin/i, /([0-9.]+)\s*arcmin/i], 1.0),
      torsionalStiffnessNmPerRad: getNum('torsionalStiffnessNmPerRad', [/扭转刚度\s*([0-9.]+)\s*Nm\/rad/i], 10000),
      loadInertiaKgm2: getNum('loadInertiaKgm2', [/负载惯量\s*([0-9.eE-]+)\s*kgm2/i, /J_L\s*=\s*([0-9.eE-]+)/i], 0.1),
      requiredPositionAccuracyArcmin: getOptionalNum('requiredPositionAccuracyArcmin', [/±\s*([0-9.]+)\s*arcmin/i, /规格要求\s*([0-9.]+)\s*arcmin/i], 3.0),
      velocityLoopBandwidthHz: getOptionalNum('velocityLoopBandwidthHz', [/速度环带宽\s*([0-9.]+)\s*Hz/i], 30),
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
