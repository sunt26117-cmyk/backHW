import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { ProjectContext, IssueInput } from '../src/types';

// Two completely new, non-preset cross-domain automotive engineering cases
export const NEW_CROSS_DOMAIN_CASE_1: { context: ProjectContext; issue: IssueInput } = {
  context: {
    projectName: 'MHEV-eTurbo-48V-Gen2',
    productType: '48V High-Power E-Charger Actuator',
    ecuType: '32-bit MCU + 48V Gate Driver + 6-MOSFET Inverter + Precision AFE',
    projectPhase: 'DV',
    asilLevel: 'ASIL B',
    customer: 'European Tier-1 Powertrain Joint Venture',
    sopDate: '2027-04-15',
    nextMilestone: 'ISO 21780 Overvoltage & Thermal Sign-off',
    daysRemaining: 14,
    costConstraint: 'Strict BOM cap: no upgrade to expensive 80V low-Rds MOSFET (BOM limit +$0.40)',
    sampleStatus: 'DV2 functional prototype with casting enclosure',
    hwLeadStyle: 'AGILE_DELIVERY',
  },
  issue: {
    issueCategories: ['Power', 'Thermal', 'Component Alternative', 'Functional Safety'],
    requirement: '1. ISO 21780 48V 动态过压脉冲 (68V, 200ms) 钳位后母线残压不得突破 MOSFET 60V 耐压降额限值 (<=48V)；2. 满载 90A 堵转时相电流分流器 (Shunt) 采样温漂误差 <= ±1.5%；3. 严禁由于采样温漂误触发 ASIL B 级过流停机。',
    actualMeasurement: '1. 48V 动态过压测试时 TVS 钳位至 58V，下桥 MOSFET 开关尖峰达 63.4V 发生重复雪崩击穿 (击穿 60V 标称耐压)；2. 0.5mΩ 锰铜分流器持续 90A 峰值温升达 145℃，铜锰焊接端产生 45μV 塞贝克热电势，叠加高共模 dv/dt 致相电流采样产生 +6.8% 虚高突跃；3. FOC 控制环误判相电流超限，在加速阶段突发切断 PWM 停机。',
    testCondition: '48V 标称供电，ISO 21780 脉冲注入 (68V 峰值 / 200ms)，90A 加速堵转，压铸密闭铝壳无主动风冷',
    environment: '发动机舱高温区 (环境温度 105℃)',
    failurePhenomenon: '动态过压叠加急加速工况下，下桥臂 MOSFET 瞬态发热异常且偶发驱动器 DESAT/OVP 保护，同时整车控制器收到电机控制器相电流过流硬件告警，电动增压器突发失速。',
    engineeringConcern: '距离 DV 试验签发仅剩 14 天。若直接换装 80V MOSFET，Rds(on) 增大 35% 导致结温超标且 BOM 超支；若直接在软件层屏蔽过流或加长消隐滤波，真实堵转时 MOSFET 无法承受短路冲击。亟需跨电源瞬态、功率半导体热阻与精密模拟采样热电势的综合解决方案。',
    measuredValues: {
      busVoltageNominalV: 48,
      busVoltagePeakV: 58,
      pulseVoltageV: 68,
      pulseDurationUs: 200000,
      junctionTempC: 145,
      currentPeakA: 90,
      vdsRatingV: 60,
      vdsSpikeV: 63.4,
      currentSenseErrorPct: 6.8,
      seebeckVoltageUv: 45,
    },
    measuredValueSource: 'USER_MEASURED',
  },
};

export const NEW_CROSS_DOMAIN_CASE_2: { context: ProjectContext; issue: IssueInput } = {
  context: {
    projectName: '800V-SiC-TractionInverter-Gen1',
    productType: 'High-Voltage Electric Drive Traction Inverter (220kW)',
    ecuType: 'Dual-Core Lockstep MCU + Isolated Gate Driver + 1200V SiC Power Module + Resolver AFE',
    projectPhase: 'DV',
    asilLevel: 'ASIL D',
    customer: 'Premium EV OEM Platform Architecture Team',
    sopDate: '2027-01-20',
    nextMilestone: 'Vehicle Winter Calibration Sign-off',
    daysRemaining: 10,
    costConstraint: 'No hardware respin before winter calibration; BOM impact must be <= $0.50',
    sampleStatus: 'DV pre-series vehicle-level inverter samples',
    hwLeadStyle: 'PROCESS_DEFENSIVE',
  },
  issue: {
    issueCategories: ['Power', 'EMC', 'Signal Integrity', 'Functional Safety'],
    requirement: '1. 800V 母线工况下 SiC 开关产生高 dv/dt 不得耦合干扰旋变解码信号，转子角度抖动必须严格控制在 <= ±3.8° 以内；2. 故障诊断响应时间必须严格满足 ASIL D FTTI (<= 5ms)；3. 严禁在急加速工况误触发三相主动短路 (ASC) 紧急制动。',
    actualMeasurement: '1. 800V 母线、450A 大扭矩急加速时，SiC 开关 dv/dt 达到 36V/ns；2. 高频共模电流经定转子 380pF 寄生杂散电容流经壳体地，在旋变差分回授 SIN/COS 线上感应出 1.8Vpp 60MHz 衰减振铃共模噪声；3. 旋变数字转换芯片 (RDC) 跟踪鉴相环瞬时失步，角度估算产生 5.2° 剧烈抖动 (突破 ASIL D 3.8° 安全门限)，控制器在 4.2ms 内紧急触发 ASC 主动短路三相制动，整车产生严重顿挫。',
    testCondition: '800V 直流母线，450A 相电流峰值，逆变器输出频率 0~600Hz，3.5m 高压三相屏蔽电缆，电机壳体接地阻抗 12mΩ',
    environment: '整车动力总成台架实验室，环境温度 40℃，冷却液流量 12L/min',
    failurePhenomenon: '百公里急加速深踩油门测试中，偶发整车剧烈机械顿挫，仪表盘报高压驱动系统故障码，逆变器记录 DTC 旋变信号丢失与 ASC 触发事件，无法达到整车标定通过要求。',
    engineeringConcern: '距离冬季标定仅剩 10 天。若在 SiC 驱动极串大栅极电阻 Rg 降低 dv/dt，则开关损耗激增 45% 导致结温超 155℃ 烧结；若软件拉大滤波时间窗或关小故障诊断，则无法在 5ms FTTI 内识别真实旋变硬件断线，面临 ISO 26262 ASIL D 法律红线。急需高频共模扼流抑制、差分共模滤波与锁相环容错的跨域精准闭环。',
    measuredValues: {
      busVoltageNominalV: 800,
      busVoltagePeakV: 840,
      dvdtVns: 36,
      currentPeakA: 450,
      strayCapacitancePf: 380,
      commonModeNoiseVpp: 1.8,
      noiseFrequencyMhz: 60,
      resolverAngleJitterDeg: 5.2,
      maxAllowedJitterDeg: 3.8,
      fttiLimitMs: 5.0,
      actualTripTimeMs: 4.2,
    },
    measuredValueSource: 'USER_MEASURED',
  },
};
