/**
 * MOSFET 器件规格层：只承载 datasheet 器件能力/特性，不等同当前 case 的实测工况。
 * 这些字段进入统一 engineering schema，允许 Device Library 自动映射并供确定性引擎消费。
 */
export const DEVICE_SPEC_FIELDS = [
  { key: 'vdsRatingV', label: 'Vds 额定耐压', unit: 'V', description: 'MOSFET 数据手册额定耐压，不是当前工况 VDS 实测值。', tag: 'SPEC' as const, category: '功率级' as const },
  { key: 'rdsOnMilliOhm', label: 'RDS(on) 数据手册基准值', unit: 'mΩ', description: '从器件 datasheet 主条件提取的 RDS(on) 基准值；工程引擎优先使用器件曲线按结温插值。', tag: 'SPEC' as const, category: '静态' as const },
  { key: 'vthMinV', label: 'VGS(th) 最小值', unit: 'V', description: '器件数据手册最小阈值；不得等同为实际 Gate 驱动电压。', tag: 'SPEC' as const, category: '静态' as const },
  { key: 'vthMaxV', label: 'VGS(th) 最大值', unit: 'V', description: '器件数据手册最大阈值；与最小值分开保留——只留最小值无法判断给定 Gate 驱动电压能否可靠开通。', tag: 'SPEC' as const, category: '静态' as const },
  { key: 'cgdPf', label: 'Cgd / Miller 电容', unit: 'pF', description: '直接 Cgd 才作为 DATASHEET 规格；Crss→Cgd 仅保留为 DERIVED 工程近似。', tag: 'SPEC' as const, category: '电容' as const },
  { key: 'cgsPf', label: 'Cgs', unit: 'pF', description: 'Datasheet 直接 Cgs 或 Ciss-Crss 派生近似；派生值必须保留其来源。', tag: 'SPEC' as const, category: '电容' as const },
  { key: 'gateChargeQgNc', label: '总栅电荷 Qg', unit: 'nC', description: 'Datasheet Gate charge 总量。', tag: 'SPEC' as const, category: '栅极驱动' as const },
  { key: 'qgdNc', label: 'Miller 电荷 Qgd', unit: 'nC', description: 'Datasheet Miller plateau charge。', tag: 'SPEC' as const, category: '栅极驱动' as const },
  { key: 'turnOffDelayNs', label: '关断延迟 td(off)', unit: 'ns', description: 'Datasheet 开关测试条件下的关断延迟。', tag: 'SPEC' as const, category: '动态' as const },
  { key: 'fallTimeNs', label: '下降时间 tf', unit: 'ns', description: 'Datasheet 开关测试条件下的下降时间。', tag: 'SPEC' as const, category: '动态' as const },
  { key: 'diodeForwardVoltageV', label: '体二极管 Vf', unit: 'V', description: 'Datasheet 体二极管正向压降及其测试条件。', tag: 'SPEC' as const, category: '二极管' as const },
  { key: 'qrrNc', label: '反向恢复电荷 Qrr', unit: 'nC', description: 'Datasheet 体二极管反向恢复电荷。', tag: 'SPEC' as const, category: '二极管' as const },
  { key: 'soaShortCircuitTimeUs', label: '短路耐受时间', unit: 'μs', description: 'Datasheet SOA/短路耐受时间；必须保留 VDS/VGS/Tj 条件。', tag: 'SPEC' as const, category: '保护/可靠性' as const },
  { key: 'easEnergyMj', label: '单脉冲雪崩能量 EAS', unit: 'mJ', description: 'Datasheet 单脉冲雪崩能量能力；若只有曲线不得伪造单值。', tag: 'SPEC' as const, category: '功率级' as const },
  { key: 'idRatingA', label: '连续漏极电流 ID', unit: 'A', description: 'MOSFET datasheet 连续漏极电流额定能力，不是当前工况电流。', tag: 'SPEC' as const, category: '功率级' as const },
  { key: 'idPulseRatingA', label: '脉冲漏极电流 ID(pulse)', unit: 'A', description: 'MOSFET datasheet 脉冲漏极电流额定能力。', tag: 'SPEC' as const, category: '功率级' as const },
  { key: 'tjMaxC', label: '最大结温 Tjmax', unit: '℃', description: '器件绝对最大结温边界，不是当前工况结温。', tag: 'SPEC' as const, category: '热' as const },
  { key: 'pdMaxW', label: '最大耗散功率 PD', unit: 'W', description: 'datasheet 最大功耗额定值，受安装/温度条件约束。', tag: 'SPEC' as const, category: '热' as const },
  { key: 'vbrDssMinV', label: 'V(BR)DSS 最小击穿电压', unit: 'V', description: 'VDS 击穿能力边界；与 Vds 额定耐压分开保留测试口径。', tag: 'SPEC' as const, category: '功率级' as const },
  { key: 'cissPf', label: '输入电容 Ciss', unit: 'pF', description: 'MOSFET 输入电容，保留 datasheet 偏置/频率条件。', tag: 'SPEC' as const, category: '电容' as const },
  { key: 'cossPf', label: '输出电容 Coss', unit: 'pF', description: 'MOSFET 输出电容，可用于开关节点寄生模型/缓冲器计算。', tag: 'SPEC' as const, category: '电容' as const },
  { key: 'qgsNc', label: '栅源电荷 Qgs', unit: 'nC', description: 'Gate charge 的 Qgs 分量。', tag: 'SPEC' as const, category: '栅极驱动' as const },
  { key: 'qswNc', label: '开关电荷 Qsw', unit: 'nC', description: 'Datasheet 定义的 switching charge。', tag: 'SPEC' as const, category: '栅极驱动' as const },
  { key: 'gatePlateauV', label: '栅极平台电压 Vplateau', unit: 'V', description: 'Gate charge 曲线平台区电压。', tag: 'SPEC' as const, category: '栅极驱动' as const },
  { key: 'turnOnDelayNs', label: '开通延迟 td(on)', unit: 'ns', description: 'Datasheet 开通延迟典型值。', tag: 'SPEC' as const, category: '动态' as const },
  { key: 'riseTimeNs', label: '上升时间 tr', unit: 'ns', description: 'Datasheet 上升时间典型值。', tag: 'SPEC' as const, category: '动态' as const },
  { key: 'trrNs', label: '反向恢复时间 trr', unit: 'ns', description: '体二极管反向恢复时间。', tag: 'SPEC' as const, category: '二极管' as const },
  { key: 'irrPeakA', label: '反向恢复峰值电流 IrrM', unit: 'A', description: '体二极管反向恢复峰值电流。', tag: 'SPEC' as const, category: '二极管' as const },
  { key: 'rthJcCPerW', label: 'RθJC（结-壳）', unit: '℃/W', description: '器件结到安装基座/壳的热阻；不要与系统 RθCA 直接相加而重复计算。', tag: 'SPEC' as const, category: '热' as const },
  { key: 'rthJaCPerW', label: 'RθJA（结-环境）', unit: '℃/W', description: 'Datasheet 特定 PCB/安装条件下结到环境热阻，仅作条件化参考。', tag: 'SPEC' as const, category: '热' as const },
  { key: 'dvdtCapabilityVns', label: 'dv/dt capability', unit: 'V/ns', description: '器件 datasheet dv/dt 能力上限，与实际开关节点 dv/dt 实测值分开。', tag: 'SPEC' as const, category: '动态' as const },
  { key: 'didtCapabilityANs', label: 'di/dt capability', unit: 'A/ns', description: '器件 datasheet di/dt 能力上限，与实际工况 di/dt 分开。', tag: 'SPEC' as const, category: '动态' as const },
  { key: 'gateVoltageMaxV', label: 'Gate 电压最大值', unit: 'V', description: 'VGS 正向最大绝对额定值。', tag: 'SPEC' as const, category: '保护/可靠性' as const },
  { key: 'gateVoltageMinV', label: 'Gate 电压最小值', unit: 'V', description: 'VGS 负向最大绝对额定值（通常以负电压表示）。', tag: 'SPEC' as const, category: '保护/可靠性' as const },
  { key: 'esdRatingKv', label: 'ESD 等级', unit: 'kV', description: '器件 ESD capability；必须保留标准/脚注条件。', tag: 'SPEC' as const, category: '保护/可靠性' as const },
  { key: 'gateResistanceOhm', label: '内部 Gate 电阻 RG(int)', unit: 'Ω', description: 'MOSFET 内部栅极电阻，参与实际驱动回路阻抗。', tag: 'SPEC' as const, category: '栅极驱动' as const },
  { key: 'idssUa', label: '漏极漏电 IDSS（跨条件最大值）', unit: 'μA', description: '从多组 VDS/VGS/Tj 条件中提取的最大漏电值；原始条件保留在器件库。', tag: 'SPEC' as const, category: '静态' as const },
  { key: 'igssNa', label: '栅极漏电 IGSS（跨条件最大值）', unit: 'nA', description: '从多组 VGS/VDS/Tj 条件中提取的最大栅极漏电值；原始条件保留在器件库。', tag: 'SPEC' as const, category: '栅极驱动' as const },
  { key: 'easCurrentA', label: '雪崩电流 IAS/EAS current', unit: 'A', description: '单脉冲/重复雪崩能力对应的电流边界。', tag: 'SPEC' as const, category: '功率级' as const },
] as const;

export const DEVICE_SPEC_FIELD_KEYS = DEVICE_SPEC_FIELDS.map((field) => field.key);

