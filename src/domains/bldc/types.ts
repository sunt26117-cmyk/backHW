import type { TraceInputSource } from '../../types';

export interface BldcEvaluationInput {
  vbusNominal: number;      // V
  vbusMeasuredPeak?: number;// V
  vdsRating: number;        // V (MOSFET 击穿耐压)
  rpm: number;              // 电机转速
  jInertia: number;         // kg·m²
  cbusUf: number;           // μF
  tAmbientC: number;        // ℃
  currentPeakA: number;     // A
  harnessLengthM: number;   // 米
  deadTimeNs: number;       // ns
  rgOffOhm: number;         // Ω
  cgdPf: number;            // pF
  dvDtVns: number;          // V/ns
  vthMinV: number;          // V
  keVkrpm?: number;         // V/krpm
  rthJc?: number;           // ℃/W (结到壳)
  rthJaTotal?: number;       // ℃/W (结到环境，datasheet 条件化总热阻)
  rdsOnMilliOhm?: number;   // mΩ

  // ---- 以下为本次修复新增的可选输入：用于把此前写死在公式里的经验假设变成
  // 显式、可核实的参数。全部保持可选，未提供时退化为原有默认值行为，但会在
  // calculatedValues 中如实标注"这是假设值"，并在其驱动一票否决时予以抑制。

  // P002
  keConvention?: 'PHASE_RMS_SINUSOIDAL' | 'LINE_PEAK_DIRECT'; // keVkrpm 的约定
  magnetLowTempFluxUpliftPct?: number; // 低温(-40℃)相对25℃的磁通提升 (%)，典型 NdFeB 约 5~10%

  // P003
  cgsPf?: number; // 栅源电容，用于容性分压界
  sourceInductanceNh?: number; // 源极寄生电感 L_source(nH)，配合 di/dt 估算门极过冲
  // [本次修复新增] 示波器导入的门极 Vgs 实测尖峰(参见 OscilloscopeImportModal 的"Vgs 门极"
  // 通道)。此前这个字段(gateSpikeV)只被导入并展示，没有任何引擎读取它——用户辛辛苦苦导入
  // 的门极尖峰波形不会影响任何风险判断。现在接入 P003：有实测值时优先于米勒效应理论估算值，
  // 因为实测直接反映了包括米勒耦合、源极电感过冲、以及模型未覆盖的其他寄生路径在内的
  // 真实总尖峰，比任何理论估算都更可信。
  gateSpikeMeasuredV?: number;

  // P004
  turnOffDelayNs?: number;       // t_d(off) 典型值
  turnOffDelayMaxNs?: number;    // t_d(off) 最坏值(datasheet max)
  fallTimeNs?: number;           // t_f 典型值
  fallTimeMaxNs?: number;        // t_f 最坏值
  driverPropMismatchNs?: number; // 驱动传输延迟失配 典型值
  driverPropMismatchMaxNs?: number; // 驱动传输延迟失配 最坏值(datasheet Propagation Delay Matching)

  // P005
  pwmSwitchingFreqHz?: number;
  diodeForwardVoltageV?: number; // 体二极管正向压降
  modulationIndex?: number;      // 调制比 m，影响死区畸变相对基波电压的占比

  // P006
  rthCaOrJa?: number;      // 壳到环境(或结到环境)热阻 ℃/W —— 取代原来硬编码的 12.0
  switchingTimeNs?: number; // 开关重叠时间
  qrrNc?: number;           // 体二极管反向恢复电荷 nC
  powerFactorCosPhi?: number;

  // P007
  pulseDurationS?: number;
  thermalTauS?: number;    // 壳/散热器侧热时间常数
  deratingBasisC?: number; // 车规降额基准温度 ℃
  tjMaxC?: number;          // 器件绝对最大结温，来自 datasheet SPEC

  // P008
  parasiticCapPf?: number; // 回路寄生电容，用于计算真实谐振频率

  // P011
  uvloTypicalV?: number;
  uvloMinV?: number;

  // P012
  gateChargeQgNc?: number;      // 高边MOSFET总栅电荷
  bootRefreshWindowUs?: number; // 强制刷新窗口
  bootChargeLoopOhm?: number;   // 自举充电回路总电阻(R_boot+R_diode+Rdson_LS)

  // P013
  capInitialTolerancePct?: number;
  capEolDeratingPct?: number;
  capLowTempDeratingPct?: number;
  capRatedRippleCurrentA?: number; // 电容 datasheet 允许纹波电流
  capRatedLifeHours?: number;      // 电容 datasheet 额定寿命
  capRatedTempC?: number;          // 额定寿命对应温度

  // P014
  loopInductanceNh?: number;
  diDtANs?: number;
  /** 由 scenarioDerived 从 measurementProvenance 映射；Pattern 页面本地调谐时可覆盖为 USER_INPUT。 */
  traceSources?: Record<string, TraceInputSource>;
  /** 导入波形的 evidenceId，用于 Trace 从数值回链到 WaveformPlot。 */
  traceEvidenceIds?: Record<string, string>;

  // P016（低压 MOSFET 通常不给短路耐受时间，此项默认值仅供参考，务必用 SOA 能量法复核）
  senseDelayNsOverride?: number;
  compDelayNsOverride?: number;
  digitalFilterDelayNsOverride?: number;
  driverPropDelayNsOverride?: number;
  gateTurnOffDelayNsOverride?: number;
  currentFallDelayNsOverride?: number;
  soaShortCircuitTimeUsOverride?: number;
  easEnergyMj?: number; // 单脉冲雪崩能量 E_AS(mJ)，来自器件库，用于短路能量预算复核

  // 器件曲线（可选）：来自器件库，按当前工况插值，替代写死系数。
  rdsOnCurve?: Array<{ x: number; y: number }>;  // x=Tj(℃), y=Rds(on)(mΩ)
  crssCurve?: Array<{ x: number; y: number }>;   // x=Vds(V), y=Crss(pF)
  vthCurve?: Array<{ x: number; y: number }>;    // x=Tj(℃), y=Vth(V)

  // ---- 以下为本次修复新增：P009/P010/P011/P018 此前是无条件 triggered:true 的硬编码
  // （不管工况是什么，每次分析都会命中），现在改为依据实际工况证据判断是否适用于当前case，
  // 未提供证据时不触发（但模式本身仍在"全部模式"列表中可查阅，只是不计入"已触发风险"）。

  // P009：电机位置传感器类型 + 自由文本中是否有霍尔信号故障的具体症状描述
  motorSensorType?: 'HALL' | 'ENCODER' | 'RESOLVER' | 'SENSORLESS';
  hallFaultRiskIndicated?: boolean;

  // P010：电流采样架构 + 自由文本中是否有采样链路故障的具体症状描述
  currentSenseArchitecture?: 'LOW_SIDE_SINGLE' | 'THREE_PHASE_LOW_SIDE' | 'INLINE_PHASE' | 'HALL_SENSOR';
  currentSenseFaultRiskIndicated?: boolean;

  // P011：预期最低供电电压(如冷启动跌落曲线) + 是否有升压稳压电路兜底 + 自由文本中是否有
  // 驱动欠压锁定/预驱死锁的具体症状描述
  vbusMinExpectedV?: number;
  hasSupplyBoostRegulation?: boolean;
  driverLockupRiskIndicated?: boolean;

  // P018：堵转/机械卡滞证据 + 实际保护标定阈值
  stallRiskIndicated?: boolean;
  stallCurrentThresholdA?: number;
  stallRpmThreshold?: number;
  stallLevel1TimeMs?: number;
  stallLevel2TimeMs?: number;
  stallLevel3TimeMs?: number;
  stallLockoutCountN?: number;
}
