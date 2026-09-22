export const AI_OPTIMIZATION_GUIDE_TEXT = `# 车规级 ECU 硬件/电机/机器人多物理场决策系统 (ECU Hardware Copilot)
## 核心架构设计、推演逻辑与外部 AI 优化指南

本文档专门为其他大模型（如 Claude 3.7 Sonnet、GPT-4o、DeepSeek-R1）或高级硬件/算法架构师提供整套系统的背景架构、工程边界及核心待优化点。

---

## 1. 软件定位与设计哲学

这是一个面向车载顶级 Tier-1 / 机器人关节执行器的**多物理场硬件决策与因果推演 Copilot 系统**。
核心原则：
1. **绝对拒绝 AI 幻觉与和稀泥**：不能靠大模型猜测参数，必须先由本地确定性物理内核（Deterministic Precomputations）算出不可推翻的硬性事实（如稳态结温 Tj、门极米勒感应电压 Vgs、母线泵升能量、机械共振带宽）。
2. **多物理场跨域因果级联（Cascade Pipeline）**：参数绝非孤立存在。高温 -> 导通内阻 Rds(on) 温漂自激 -> 稳态结温升高 -> 门极开启阈值 Vth 发生负温漂衰减 -> 反向对管开通瞬态 Cgd * (dv/dt) * Rg 米勒感应电压击穿 Vth -> 导致同桥臂上下管微直通/炸管。
3. **严格工程责任与标准边界**：
   - **ISO 26262 / ASIL-D**：SPFM >= 99%, LFM >= 90%, 严禁在无诊断覆盖率（DC）补偿下削减硬件安全机制。
   - **IATF 16949 Section 8.7**：严格区分“内部样件特批（有台套号限制与物理隔离）”与“主机厂外部特采（走正式 VDA ECR 流程）”。
   - **领导心理与博弈（CTSQL 模型）**：
     - C (Cost 成本)、T (Time 工期)、S (Safety 安全)、Q (Quality 质量)、L (Leadership 领导与免责)。
     - 识别技术求稳型、敏捷交付型、流程免责型领导，并生成针对性沟通话术。

---

## 2. 核心架构与模块全景树

整套系统采用 **React 18 + TypeScript + Vite + Express** 全栈架构，实现了离线物理内核与云端大模型推演双模运行：

\`\`\`text
├── package.json               # 核心依赖与打包配置 (支持一键构建单文件离线 bundle)
├── server.ts                  # 全栈后端入口 (Express + Vite 中间件，集成 OpenAI/Gemini 双协议与容错解析)
├── src/
│   ├── types.ts               # 业务实体模型 (ProjectContext, IssueInput, CopilotAnalysisResult, VetoItem 等)
│   ├── types/
│   │   ├── v4Models.ts        # 纯底层物理状态树 (UnifiedEngineeringModel, 预计算事实 PrecomputedFact 等)
│   │   └── motorDrive.ts      # BLDC 电气模型参数定义
│   ├── utils/
│   │   ├── deterministicPrecomputation.ts  # 【核心调度】确定性前置计算总控 DAG
│   │   ├── thermalCascadeEngine.ts         # 【物理级联】多物理场热-电-内阻-阈值温漂级联计算
│   │   ├── bldcDeterministicEngine.ts      # 【BLDC 判定】母线泵升与高温米勒感应门极直通
│   │   ├── motorPhysicsEngine.ts           # 【底层力学】动能转化、微积分滤波、RC Snubber 物理推导
│   │   ├── robotJointDeterministicEngine.ts # 【机器人关节】谐波减速器机械背隙、传动柔度判定
│   │   ├── robotJointResonance.ts          # 【机器人力学】双质量共振频率与控制截止频率方程
│   │   ├── scenarioDomainEngine.ts         # 【领域解析】将工况分类分流至 BLDC/EMC/Thermal/Robot 等主域
│   │   ├── unifiedStateExtractor.ts        # 【状态清洗】从非结构化描述与实测表单中清洗出统一状态树
│   │   ├── crossDomainCouplingMatrix.ts    # 【跨域规则】跨领域物理耦合与硬性否决边界矩阵
│   │   ├── aiResultAuditor.ts              # 【防幻觉审计】强制核验 AI 输出是否符合物理事实与一票否决
│   │   ├── domainAdaptivePromptEngine.ts   # 【动态 Prompt】根据工况证据等级智能组装 Prompt 规约
│   │   └── dualTimelineEngine.ts           # 【双时间轴】T+24h 应急临时遏制与下一版永久纠正规划
│   ├── data/
│   │   ├── expertEngine.ts                 # 【专家系统总中枢】综合决策生成、一票否决(VETO)与装配
│   │   ├── bldcMotorExpert.ts              # BLDC 领域专家支柱、失效模式与根因假设树
│   │   ├── robotJointExpert.ts             # 机器人关节领域专家知识库与减速器工况机理
│   │   ├── decisionPillars.ts              # 质量与功能安全基石 (降额规范、EMC BCI 注入等)
│   │   └── presetScenarios.ts              # 15+ 车规与机器人标杆工况库 (含急停直通、机械谐振等)
│   └── components/
│       ├── DecisionCockpitView.tsx         # 决策驾驶舱 (核心判定、VETO审查、CTSQL雷达图、双时间轴)
│       ├── AnalysisFactView.tsx            # 物理计算证据链看板 (展示公式推导、实测比对与裕量判定)
│       ├── FirstScreen10sView.tsx          # 10秒快速决策看板 (直给推荐、责任人、停机条件)
│       ├── VerificationLoopView.tsx        # 闭环验证试验台 (台架试验大纲、测试治具与边界测量)
│       ├── DesignReviewRegressionView.tsx  # 设计审查与回归核对 (DFMEA、Checklist)
│       └── MotorDriveToolbox.tsx           # BLDC 与电机驱动快速物理计算工具箱
\`\`\`

---

## 3. 关键物理算法与数学模型说明

### (1) 热-电-米勒跨域物理级联链条 (thermalCascadeEngine.ts)
- **功耗组成**：
  - 导通损耗：P_cond = I_rms^2 * R_ds(on)(T_j)
  - 开关损耗：P_sw = V_bus * I * (t_r + t_f) * f_pwm
- **内阻温漂自激迭代**：
  R_ds(on)(T_j) = R_ds(on, 25℃) * (1 + alpha * (T_j - 25))^1.8
  引擎通过数值迭代逼近稳态结温 T_j：
  T_j = T_case + P_total(T_j) * R_theta_jc
- **门极开启阈值温漂衰减**：
  V_th(T_j) = V_th, 25℃ + k_temp * (T_j - 25)
  其中车规 MOSFET 典型的 k_temp 约为 -2.0 ~ -2.5 mV/℃。
- **反向开通米勒位移感应电压**：
  V_gs_induced ≈ C_gd * (dv/dt) * R_g_off
  **安全判据**：安全裕量 Delta_V = V_th(T_j) - V_gs_induced。
  - Delta_V >= 0.5V：PASS (安全)
  - 0 <= Delta_V < 0.5V：MARGINAL (濒危预警)
  - Delta_V < 0：CRITICAL (击穿直通炸管，触发 VETO)

### (2) 电机急停母线泵升能量倒灌模型 (motorPhysicsEngine.ts)
- 系统旋转动能：E_regen = 0.5 * J * omega^2
- 动能向母线吸收电容转移后的泵升电压峰值：
  V_peak = sqrt(V_bus_nominal^2 + (2 * E_regen * eta) / C_bus)
- 耐压裕量：Delta_V = V_ds_rating - V_peak，若 Delta_V < 0 则判定 MOS 击穿风险。

### (3) 机器人关节双质量共振模型 (robotJointResonance.ts)
- 基于电机转子惯量 J_m、负载惯量 J_l 与谐波减速器抗扭刚度 K_t：
  f_res = (1 / (2 * pi)) * sqrt(K_t * (1/J_m + 1/J_l))
- 控制截止带宽与相位滞后判定，决定前馈陷波器与滤波阶数。

---

## 4. 请外部 AI 重点协助优化的技术方向

若您把源码包发送给其他先进大语言模型（如 Claude 3.7 Sonnet、GPT-4o、DeepSeek-R1），推荐输入以下具体优化课题：

0. **【最高优先级】模式引擎"触发条件与工况脱钩"排查**（2026-09 审查新增）：
   - 历史教训：bldcPatternEngine.ts 里 P009/P010/P011/P018 曾经长期是 triggered:true 硬编码，
     不管工况是什么、case内容是什么都会无条件命中，导致"工况变了、分析结论基本不变"——这是
     比下面几条数学模型精度问题严重得多的根因级缺陷，且不容易从表面代码走查发现(硬编码的
     triggered:true 看起来跟其它正常写法没有区别，必须结合 verify-engines.ts 跑真实工况对比
     才能发现)。已于 2026-09 修复为依据 motorSensorType/currentSenseArchitecture/
     stallRiskIndicated 等结构化证据字段 + 自由文本症状关键词双路径判断。
   - 优化方向：新增任何模式(P0xx/J0xx)时，第一步先问"这条 triggered 逻辑在输入完全不提供
     相关证据的'温和工况'下是否为 false"，并在 verify-engines.ts 的负例断言里加一行覆盖，
     而不是等到走查代码时才发现。同时排查 P013/P014 是否存在类似的"默认兜底假设值过于容易
     越过触发阈值"问题——温和工况下 P013 因 cbusUf 缺省470uF < 600uF 阈值而触发，P014 因
     "P001最坏工况理论泵升 × P014自身30%过冲假设系数"两层假设叠加越过75%降额线而触发，
     这两个都是本轮修复顺带发现、但未处理的独立问题(已在 verify-engines.ts 里用注释显式
     排除出负例断言范围并写明原因，未被悄悄隐藏)。
   - 优化方向：verify-engines.ts 里任何"负例断言只覆盖一部分模式ID"的写法都要重新审视——
     若某个模式ID被排除在负例断言之外且没有像上面这样写清楚原因的注释，视为可疑信号。
1. **热力学瞬态网络升级**：
   - 当前 thermalCascadeEngine.ts 使用了基于 R_theta_jc 的稳态收敛迭代。
   - 优化方向：引入 Foster 4阶或 Cauer 热网络微分方程，以支持急停制动等脉冲工况下的毫秒级瞬态温升峰值 T_j_peak(t) 计算。
2. **米勒效应微积分动态仿真求解**：
   - 当前使用一阶等效代数公式 V_gs ≈ C_gd * (dv/dt) * R_g，2026-09 已接入示波器实测 Vgs 尖峰
     (gateSpikeV) 作为优先判据来源，但理论模型本身仍是一阶代数近似。
   - 优化方向：引入由寄生电感 L_source、输入电容 C_iss 构成的 RLC 二阶欠阻尼瞬态振荡模型，更精确捕捉高频振铃导致的偶发直通。
3. **跨域耦合矩阵扩展**：
   - 当前在 crossDomainCouplingMatrix.ts 中定义了 BLDC、EMC、Thermal、Functional Safety 等耦合对。
   - 优化方向：进一步丰富 ISO 26262 硬件指标定量分配算法（如自动依据 FMEDA 格式计算单点失效度量 SPFM 和潜伏失效度量 LFM）。
4. **状态提取健壮性与 TypeScript 类型精简**：
   - 对 src/types.ts 和 v4Models.ts 结构进行更优雅的泛型解耦与运行时校验（如 Zod Schema 接入）。
   - 已知遗留问题：bldcPatternEngine.ts 顶部 import 的 UnifiedEngineeringModel 类型未被实际使用，
     真实输入来自 scenarioDerived.ts 单独的一套提取逻辑，跟 unifiedStateExtractor.ts 是两条平行、
     没有交叉验证的路径，属于本轮修复范围之外的架构级问题，建议单独立项处理，不要在小修小补中
     顺带动它。
`;
