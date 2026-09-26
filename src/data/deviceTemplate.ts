/**
 * 器件资料参数提取模板。
 * 设计原则：AI 尽可能“多提取”，但绝不猜测；每个值都必须带来源、条件与统计口径。
 * 产出的 JSON 既可进入器件库，也可通过候选池选择性导入当前工程输入。
 */

import { MOSFET_FIELD_TABLE } from '../utils/mosfetFieldTable';

/**
 * Prompt 的映射清单不再手写，而是从 canonical 字段表推导 —— 这样「字段表比 Prompt 新」这类
 * 漂移在结构上不可能再发生（本轮就修过 6 个：idssUa / igssNa / gateResistanceOhm /
 * dvdtCapabilityVns / didtCapabilityANs / soaShortCircuitTimeUs 存在于字段表却不在 Prompt 里）。
 * 治理测试 scripts/verify-device-candidate-governance.ts 会断言这三组与字段表一致。
 */

/** ① 可直接自动导入：datasheet 直给、且是单值标量（非曲线/集合）。 */
export const DIRECT_MAPPABLE_TARGET_KEYS: readonly string[] = MOSFET_FIELD_TABLE
  .filter((spec) => spec.targetKey !== null && spec.defaultSourceType === 'DATASHEET_DIRECT' && !spec.valueKind)
  .map((spec) => spec.targetKey as string);

/** ② 只能作为「需工程确认」候选：曲线选点（图估）出来的 targetKey。 */
export const CURVE_ESTIMATE_TARGET_KEYS: readonly string[] = MOSFET_FIELD_TABLE
  .filter((spec) => spec.targetKey !== null && (spec.valueKind === 'curve' || spec.defaultSourceType === 'DATASHEET_GRAPH_ESTIMATE'))
  .map((spec) => spec.targetKey as string);

/** ③ 只能作为「需工程确认」候选：由其它量派生或由 variants 恢复，字段表里没有直源。 */
export const DERIVED_TARGET_KEYS: readonly string[] = ['cgsPf', 'gateVoltageMinV'];

export const CONFIRM_REQUIRED_TARGET_KEYS: readonly string[] = [...CURVE_ESTIMATE_TARGET_KEYS, ...DERIVED_TARGET_KEYS];

export const DEVICE_PARAM_PROMPT = [
  '你是汽车电子功率器件 datasheet 参数提取助手。输入可能是一份 MOSFET 规格书的全文、OCR 文本、表格文本或图片转写结果。',
  '你的任务不是做工程判断，而是把规格书中“明确给出的数据”尽可能完整地结构化提取出来，供另一个软件做工程风险分析。',
  '只输出一个合法 JSON；不要 markdown、不要解释、不要补充 JSON 之外的文字。',
  '',
  '【绝对规则】',
  '1. 只使用规格书明确出现的数据。找不到就填 null / []，绝不猜值、绝不用常见器件经验补值。',
  '2. 每个数值必须尽量保留测试条件：VGS、VDS/VDD、ID/IF、Tj/Tc、Rg、频率、di/dt、安装方式、占空比等；条件未知就写 null。',
  '3. 同一个参数如果有 typ / min / max 多个口径，分别保留，不要只留一个。',
  '4. 数值单位必须严格按模板要求；不要因为“方便”而偷偷改变物理量含义。',
  '5. source 必须写规格书证据位置：Table/Fig/页码/章节；无法定位就写 null。',
  '6. 图表曲线优先提取尽可能多的关键点。点数不足时不要伪造中间点。',
  '7. 曲线从图片估读时，sourceType 写 DATASHEET_GRAPH_ESTIMATE，confidence 不得高于 0.85；表格直接读取可写 DATASHEET_DIRECT。',
  '8. “直接给出”的值与“由其他值计算”的值必须严格分开。推导值 sourceType=DERIVED，并写 derivation。',
  '9. 不要把工程当前 case 的测量值混入 datasheet 参数。datasheet 只是器件能力/特性的来源。',
  '10. 同一参数存在多个温度/电压条件时全部保留，不要覆盖；单值字段无法容纳多个口径时，在该对象的 variants 数组中逐条保留。',
  '11. 如果同一参数同时出现 typ/min/max，value 只放一个主值，其他口径必须写入 variants[{value,unit,stat,conditions,source,sourceType,confidence,note}]，不得丢掉。',
  '12. 如果无法从原文确定参数名称、数值、单位、测试条件或来源位置，宁可留空并记录 documentAmbiguities，也不要猜测。',
  '13. 数值不得只写在 note 里。若该数值在模板中有对应字段（或该字段的 variants），必须同时落到那个字段，note 仅作补充说明。**特别是 Gate 电压额定为双向范围时（例如 -20 V ~ +20 V）**：必须把负向额定作为 protectionAndRobustness.gateVoltageMax.variants 中的一条负值记录（value 为负数，stat / conditions / source / sourceType 与正向一致），不能只写 note —— 工程侧要从 variants 恢复 gateVoltageMinV，只写 note 会让这个值在工程侧完全不可用。同理，任何“范围/双向/多条件”额定值都必须进 variants 而不是进 note。',
  '',
  '【重点提取范围】',
  'A. 最大额定：VDS、ID、ID pulse、TJmax、Tstg、PD、EAS/UIS、雪崩电流等；',
  'B. 静态：RDS(on) 及其 Tj/VGS/ID 条件、VGS(th) 及温度变化、V(BR)DSS、IDSS、IGSS、内部 Gate 电阻 RG(int)；',
  'C. 电容：Ciss/Coss/Crss，尤其提取随 VDS 变化的曲线；Crss 可作为工程 Cgd 近似候选，但必须保留原始名称 Crss；',
  'D. Gate charge：Qg、Qgs、Qgd、Qsw、平台电压及 gate-charge 曲线；',
  'E. 开关：td(on)、tr、td(off)、tf，连同 VDD/ID/RG/VGS 等测试条件；',
  'F. 二极管：Vf、Qrr、trr、Irrm、di/dt、Tj 等条件；',
  'G. 热：RthJC、RthJA、ZthJC(t)、功耗、封装/安装限制；',
  'H. SOA：DC、10 ms、1 ms、100 us、10 us 等脉宽下的 VDS-ID 边界点，尽可能多提；',
  'I. 其它对 BLDC 风险有帮助的数据：dv/dt/di/dt capability、短路耐受时间、Gate voltage limit、ESD、雪崩、UIS 等。',
  '',
  '【数据完整性】',
  '每个可提取对象建议包含：value / unit / stat / conditions / source / sourceType / confidence / note。',
  '若一个参数是一条曲线，使用 points 数组，并保留 xAxis、xUnit、yUnit、conditions、source。',
  'extractionHints.unmappedImportantData 用于承载模板之外但对工程判断有价值的数据；每项建议包含 key、label、value、unit、stat、conditions、source、sourceType、confidence、note。key 必须稳定且唯一，禁止把未映射数据丢掉。',
  '若规格书仅给典型值，不要把 typ 自动写成 max；反之亦然。',
  '若文档出现不同版本/脚注，优先保留原始脚注并放入 note。',
  '',
  '【工程映射】',
  '请同时在 extractionHints.mapping 中给出该数据最可能支持的工程字段 targetKey（仅从模板列出的 targetKey 中选择），但不要强行映射不能确定的字段。无法安全映射的参数必须进入 unmappedImportantData，而不是丢弃。',
  '可直接自动导入的器件规格字段（datasheet 直给的单值标量，共 ' + DIRECT_MAPPABLE_TARGET_KEYS.length + ' 个）：' + DIRECT_MAPPABLE_TARGET_KEYS.join('、') + '。',
  '以下 targetKey 只能作为「需工程确认」的候选，禁止在 mapping 里标成可直接自动导入：' + CONFIRM_REQUIRED_TARGET_KEYS.join('、') + '。原因：cgsPf 当前模板没有直接 Cgs 字段，只能由 Ciss 减 Crss 派生；rdsOnMilliOhm / vthMinV 来自曲线选点（图估），不是规格书保证值；gateVoltageMinV 没有独立字段，是从 protectionAndRobustness.gateVoltageMax 的负向 variant 恢复出来的；cgdPf 若取自 capacitanceParams.cgdDirect 属直接值，若由 Crss 换算而来则属派生值，必须在 sourceType 上如实区分，不得把 Crss 冒充成 datasheet 直给 Cgd。',
  '已有明确 targetKey 的参数应优先按 extractionHints.mapping 自动对齐，不要要求工程师重复选择；无法安全投影成工程单值的多条件/曲线数据（SOA、ZthJC(t)、Crss 原始曲线、gate-charge 曲线、Tstg、bodyChannelCurrent 等）继续保留在器件库与 unmappedImportantData 中，不得为了减少提示而选取错误条件或编造 targetKey。',
  '',
  '【引擎取点规则（提取时必须满足，否则该字段在计算中不可用）】',
  '1. Cgd：优先工程师实测/导入值；缺实测时按器件 **Crss 曲线在工况 Vbus 处插值**（Crss ≡ Cgd），再退到直接给出的 Cgd。所以 Crss 曲线的 VDS 点必须提取（至少 2 点），不能只给一个标量。',
  '2. Cgs：只能由**同一个 VDS 点**的 Ciss − Crss 派生。必须提取 capacitanceParams.ciss.conditions.vds；缺测试 VDS 时 Cgs 会被判为不可用——宁可没有值，也禁止跨电压点相减。',
  '3. Vth：判据取点是**最坏情况（结温最高 → Vth 最低）**。必须提取 Vth 随 Tj 的曲线与 maxRatings.tjMax；只留 25℃ 标量会低估米勒误导通风险。',
  '4. Qg：gateCharge.qg 与工程侧 COMPONENT 的 Qg 是**同一个物理量**（互为别名），不要当成两个参数，也不要丢弃任一侧。',
].join('\n');

export const MOSFET_PARAM_TEMPLATE = {
  schemaVersion: '2.1',
  deviceType: 'MOSFET',
  partNumber: null,
  manufacturer: null,
  package: null,
  aecqGrade: null,
  channelType: 'N-CH',
  extractionMeta: {
    documentTitle: null,
    documentRevision: null,
    sourceFile: null,
    extractionDate: null,
    notes: [],
  },
  maxRatings: {
    vds: { value: null, unit: 'V', conditions: { tj: null }, stat: 'MAX', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null, variants: [] },
    id: { value: null, unit: 'A', conditions: { tc: null, tj: null }, stat: 'MAX', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null, variants: [] },
    idPulse: { value: null, unit: 'A', conditions: { pulseTimeUs: null, tc: null, tj: null }, stat: 'MAX', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null, variants: [] },
    tjMax: { value: null, unit: '℃', conditions: {}, stat: 'MAX', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null, variants: [] },
    tstg: { minValue: null, maxValue: null, unit: '℃', conditions: {}, stat: 'MAX', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null, variants: [] },
    powerDissipation: { value: null, unit: 'W', conditions: { tc: null, tj: null }, stat: 'MAX', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null, variants: [] },
    easPulse: { value: null, unit: 'mJ', conditions: { id: null, vdd: null, l: null, startingTj: null }, stat: 'MAX', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null, variants: [] },
    easCurrent: { value: null, unit: 'A', conditions: { pulseTimeUs: null }, stat: 'MAX', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null, variants: [] },
  },
  soaCurve: {
    source: null,
    sourceType: 'DATASHEET_GRAPH_ESTIMATE',
    confidence: null,
    note: null,
    curves: [
      { pulseTimeUs: 'DC', points: [] },
      { pulseTimeUs: 10000, points: [] },
      { pulseTimeUs: 1000, points: [] },
      { pulseTimeUs: 100, points: [] },
      { pulseTimeUs: 10, points: [] },
    ],
  },
  staticParams: {
    rdsOn: {
      xAxis: 'tj', xUnit: '℃', yUnit: 'mΩ', conditions: { vgs: null, id: null }, stat: 'TYP',
      points: [], source: null, sourceType: 'DATASHEET_GRAPH_ESTIMATE', confidence: null, note: null,
    },
    vth: {
      xAxis: 'tj', xUnit: '℃', yUnit: 'V', conditions: { id: null, vds: null }, stat: 'MIN',
      points: [], source: null, sourceType: 'DATASHEET_GRAPH_ESTIMATE', confidence: null, note: null,
    },
    bodyChannelCurrent: { value: null, unit: 'A', conditions: {}, stat: 'TYP', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null, variants: [] },
    vbrDss: { value: null, unit: 'V', conditions: { tj: null, id: null }, stat: 'MIN', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null, variants: [] },
    idss: { value: null, unit: 'μA', conditions: { vds: null, vgs: null, tj: null }, stat: 'MAX', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null, variants: [] },
    igss: { value: null, unit: 'nA', conditions: { vgs: null, vds: null, tj: null }, stat: 'MAX', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null, variants: [] },
    gateResistance: { value: null, unit: 'Ω', conditions: { f: null, tj: null }, stat: 'TYP', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null, variants: [] },
  },
  capacitanceParams: {
    ciss: { value: null, unit: 'pF', conditions: { vds: null, vgs: 0, f: null }, stat: 'TYP', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null },
    coss: { value: null, unit: 'pF', conditions: { vds: null, vgs: 0, f: null }, stat: 'TYP', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null },
    crss: { xAxis: 'vds', xUnit: 'V', yUnit: 'pF', conditions: { vgs: 0, f: null }, stat: 'TYP', points: [], source: null, sourceType: 'DATASHEET_GRAPH_ESTIMATE', confidence: null, note: null },
    cgdDirect: { value: null, unit: 'pF', conditions: { vds: null, vgs: null, f: null }, stat: 'TYP', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: '只有规格书明确写 Cgd 时填写；不要把 Crss 自动改名成 Cgd。' },
  },
  gateCharge: {
    qg: { value: null, unit: 'nC', conditions: { vgs: null, vds: null, id: null }, stat: 'TYP', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null },
    qgs: { value: null, unit: 'nC', conditions: { vgs: null, vds: null, id: null }, stat: 'TYP', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null },
    qgd: { value: null, unit: 'nC', conditions: { vgs: null, vds: null, id: null }, stat: 'TYP', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null },
    qsw: { value: null, unit: 'nC', conditions: { vgs: null, vds: null, id: null }, stat: 'TYP', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null },
    gatePlateauV: { value: null, unit: 'V', conditions: { vgs: null, vds: null, id: null }, stat: 'TYP', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null },
    gateChargeCurve: { xUnit: 'nC', yUnit: 'V', points: [], source: null, sourceType: 'DATASHEET_GRAPH_ESTIMATE', confidence: null, note: null },
  },
  switchingParams: {
    tr: { value: null, unit: 'ns', conditions: { vdd: null, id: null, rg: null, vgs: null }, stat: 'TYP', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null },
    tf: { value: null, unit: 'ns', conditions: { vdd: null, id: null, rg: null, vgs: null }, stat: 'TYP', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null },
    tdOn: { value: null, unit: 'ns', conditions: { vdd: null, id: null, rg: null, vgs: null }, stat: 'TYP', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null },
    tdOff: { value: null, unit: 'ns', conditions: { vdd: null, id: null, rg: null, vgs: null }, stat: 'TYP', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null },
    dvdtCapability: { value: null, unit: 'V/ns', conditions: { vds: null, gateCondition: null }, stat: 'MAX', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null },
    didtCapability: { value: null, unit: 'A/ns', conditions: { vds: null, gateCondition: null }, stat: 'MAX', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null },
  },
  thermalParams: {
    rthJc: { value: null, unit: '℃/W', conditions: { mounting: null }, stat: 'MAX', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null },
    rthJa: { value: null, unit: '℃/W', conditions: { footprint: null }, stat: 'TYP', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null },
    zthJc: { xUnit: 's', yUnit: '℃/W', points: [], conditions: { mounting: null }, source: null, sourceType: 'DATASHEET_GRAPH_ESTIMATE', confidence: null, note: null },
  },
  bodyDiode: {
    vf: { value: null, unit: 'V', conditions: { if: null, tj: null }, stat: 'TYP', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null },
    qrr: { value: null, unit: 'nC', conditions: { if: null, diDt: null, tj: null, vr: null }, stat: 'TYP', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null },
    trr: { value: null, unit: 'ns', conditions: { if: null, diDt: null, tj: null, vr: null }, stat: 'TYP', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null },
    irrM: { value: null, unit: 'A', conditions: { if: null, diDt: null, tj: null, vr: null }, stat: 'TYP', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null },
  },
  protectionAndRobustness: {
    shortCircuitTime: { value: null, unit: 'μs', conditions: { vds: null, vgs: null, tj: null }, stat: 'MAX', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null },
    gateVoltageMax: { value: null, unit: 'V', conditions: { tj: null }, stat: 'MAX', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null },
    esdRating: { value: null, unit: 'kV', conditions: {}, stat: 'MAX', source: null, sourceType: 'DATASHEET_DIRECT', confidence: null, note: null },
  },
  extractionHints: {
    mapping: [],
    unmappedImportantData: [],
    documentAmbiguities: [],
  },
};

export const MOSFET_TEMPLATE_JSON = JSON.stringify(MOSFET_PARAM_TEMPLATE, null, 2);

export const DEVICE_FIELD_MEANINGS: Array<{ field: string; engine: string }> = [
  { field: 'maxRatings.vds', engine: 'P001/P014 耐压一票否决；当前工程候选 vdsRatingV' },
  { field: 'maxRatings.tjMax', engine: '器件绝对最大结温边界 → tjMaxC；严禁映射为 junctionTempC（当前工况结温）' },
  { field: 'maxRatings.tstg', engine: '器件存储温度范围；当前工程无等价单值输入，保留作器件能力边界证据' },
  { field: 'staticParams.rdsOn 曲线', engine: 'P006 结温迭代；完整曲线留在器件库，工程输入可选取 25℃点' },
  { field: 'staticParams.vth 曲线', engine: 'P003 米勒直通裕量；工程输入候选 vthMinV' },
  { field: 'capacitanceParams.crss 曲线', engine: 'P003 米勒位移电流；可作为 cgdPf 候选，原始名称保持 Crss' },
  { field: 'capacitanceParams.ciss/coss', engine: '器件规格直接进入 cissPf/cossPf；Cgs 仍保留 Ciss-Crss 的推导链，不把推导冒充 direct Cgs' },
  { field: 'gateCharge.qg/qgs/qgd/qsw/gatePlateauV', engine: '分别进入 gateChargeQgNc/qgsNc/qgdNc/qswNc/gatePlateauV；用于 P012/驱动能力与瞬态边界' },
  { field: 'switchingParams', engine: 'P004 死区动态；turnOnDelayNs/riseTimeNs/turnOffDelayNs/fallTimeNs 自动承接对应 datasheet 单值' },
  { field: 'thermalParams.rthJc/rthJa/zthJc', engine: 'RθJC/RθJA 进入独立器件规格层；P006 在具备条件时使用 RθJA，总热阻不得与 RθJC 重复相加；ZθJC 曲线继续保留为曲线证据' },
  { field: 'bodyDiode.qrr/trr/vf', engine: 'P005/P006 反向恢复与二极管损耗' },
  { field: 'soaCurve', engine: 'P016 短路 SOA 能量/安全区复核' },
  { field: 'protectionAndRobustness', engine: 'shortCircuitTime → soaShortCircuitTimeUs；gateVoltageMax/min → gateVoltageMaxV/gateVoltageMinV；ESD → esdRatingKv；这些属于器件绝对能力边界，不当作当前实测工况' },
];
