/**
 * 器件参数提取模板：粘贴给免费 AI 的指令 + 固定 JSON 结构 + 字段→引擎映射说明。
 * 供 DeviceLibraryModal 的「复制模板 / 复制指令 / 字段说明」展示，随时调用。
 */

export const DEVICE_PARAM_PROMPT = [
  '你是车规功率器件参数提取助手。我会给你一份 MOSFET 规格书（datasheet）内容。',
  '请只输出一个合法 JSON，不要任何解释、不要 markdown 代码块外壳。',
  '',
  '要求：',
  '1. 严格按我给的 JSON 结构输出，字段名不要改。',
  '2. 每个数值必须带 conditions（工况）：在什么 Vgs/Id/Tj/Vds/频率/封装焊盘下测的。',
  '3. 曲线参数（随 Tj 或 Vds 变的）用 points:[{x,y}] 列点：',
  '   - rdsOn 用 tj=25/125/150 三个点',
  '   - crss 用 vds=10/25/50 三个点',
  '   - vth 用 tj=25/125 两个点',
  '4. 每个数值标 stat：typ(典型) / max(最大) / min(最小)。',
  '5. 每个数值标 source：来自规格书哪个表格/图（如 Fig.5 / Table 3）。',
  '6. 规格书里读不到的字段，value 填 null，并在 note 里写规格书未提供。',
  '7. 单位必须用我指定的单位，不要自己换算成别的。',
].join('\n');

/** 固定 JSON 模板（MOSFET），null 处让免费 AI 替换为读到的数值。 */
export const MOSFET_PARAM_TEMPLATE = {
  deviceType: 'MOSFET',
  partNumber: null,
  manufacturer: null,
  package: null,
  aecqGrade: 'AEC-Q101 Grade 1',
  channelType: 'N-CH',
  maxRatings: {
    vds: { value: null, unit: 'V', conditions: { tj: 25 }, stat: 'max', source: null },
    id: { value: null, unit: 'A', conditions: { tc: 25 }, stat: 'max', source: null },
    tjMax: { value: null, unit: '℃', conditions: {}, stat: 'max', source: null },
    easPulse: { value: null, unit: 'mJ', conditions: { id: null, vdd: null }, stat: 'max', source: null },
  },
  staticParams: {
    rdsOn: {
      xAxis: 'tj', conditions: { vgs: 10, id: 20 }, stat: 'typ',
      points: [{ x: 25, y: null }, { x: 125, y: null }, { x: 150, y: null }], source: null,
    },
    vth: {
      xAxis: 'tj', conditions: { id: 0.00025, vds: 'vgs' }, stat: 'min',
      points: [{ x: 25, y: null }, { x: 125, y: null }], source: null,
    },
  },
  capacitanceParams: {
    ciss: { value: null, unit: 'pF', conditions: { vds: 25, vgs: 0, f: 1000000 }, stat: 'typ', source: null },
    coss: { value: null, unit: 'pF', conditions: { vds: 25, vgs: 0, f: 1000000 }, stat: 'typ', source: null },
    crss: {
      xAxis: 'vds', conditions: { vgs: 0, f: 1000000 }, stat: 'typ',
      points: [{ x: 10, y: null }, { x: 25, y: null }, { x: 50, y: null }], source: null,
    },
  },
  gateCharge: {
    qg: { value: null, unit: 'nC', conditions: { vgs: 10, vds: 48, id: 20 }, stat: 'typ', source: null },
    qgs: { value: null, unit: 'nC', conditions: { vgs: 10, vds: 48, id: 20 }, stat: 'typ', source: null },
    qgd: { value: null, unit: 'nC', conditions: { vgs: 10, vds: 48, id: 20 }, stat: 'typ', source: null },
  },
  switchingParams: {
    tr: { value: null, unit: 'ns', conditions: { vdd: 48, id: 20, rg: 4.7 }, stat: 'typ', source: null },
    tf: { value: null, unit: 'ns', conditions: { vdd: 48, id: 20, rg: 4.7 }, stat: 'typ', source: null },
    tdOn: { value: null, unit: 'ns', conditions: { vdd: 48, id: 20, rg: 4.7 }, stat: 'typ', source: null },
    tdOff: { value: null, unit: 'ns', conditions: { vdd: 48, id: 20, rg: 4.7 }, stat: 'typ', source: null },
  },
  thermalParams: {
    rthJc: { value: null, unit: '℃/W', conditions: { mounting: null }, stat: 'max', source: null },
    rthJa: { value: null, unit: '℃/W', conditions: { footprint: null }, stat: 'typ', source: null },
  },
  bodyDiode: {
    vf: { value: null, unit: 'V', conditions: { if: 20, tj: 25 }, stat: 'typ', source: null },
    qrr: { value: null, unit: 'nC', conditions: { if: 20, diDt: 100, tj: 25 }, stat: 'typ', source: null },
    trr: { value: null, unit: 'ns', conditions: { if: 20, diDt: 100, tj: 25 }, stat: 'typ', source: null },
  },
};

export const MOSFET_TEMPLATE_JSON = JSON.stringify(MOSFET_PARAM_TEMPLATE, null, 2);

/** 字段 → 物理引擎判断 的说明（用于界面展示）。 */
export const DEVICE_FIELD_MEANINGS: Array<{ field: string; engine: string }> = [
  { field: 'maxRatings.vds', engine: 'P001/P014 耐压一票否决' },
  { field: 'maxRatings.tjMax', engine: 'P006/P007 结温上限' },
  { field: 'staticParams.rdsOn (3点)', engine: 'P006 结温迭代（替代写死 3.5mΩ + 1.65x/1.85x）' },
  { field: 'staticParams.vth (2点)', engine: 'P003 米勒直通裕量（把 -3mV/℃ 温漂真正算进去）' },
  { field: 'capacitanceParams.crss (3点)', engine: 'P003 米勒位移电流（替代写死 45pF）' },
  { field: 'gateCharge.qg/qgs/qgd', engine: 'P012 自举、开关损耗' },
  { field: 'switchingParams.tr/tf/tdOn/tdOff', engine: 'P004 死区、P016 保护时序' },
  { field: 'thermalParams.rthJc/rthJa', engine: 'P006/P007 结温与热裕量' },
  { field: 'bodyDiode.qrr/trr', engine: 'P006 反向恢复损耗' },
];

