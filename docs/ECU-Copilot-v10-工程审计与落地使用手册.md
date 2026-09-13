# ECU Copilot v1.5 Engineering OS：工程审计与落地使用手册

## 1. 这次迭代的目标

这版不是继续增加静态案例，而是把系统从“案例演示器”改造成“真实工程问题闭环工作台”。核心原则：

- 固定：物理公式、工程方法、风险框架、标准适用性骨架、页面结构。
- 动态：项目、工况、实测值、规格、测试条件、风险、候选方案、验证门禁、EDR文本。
- 严禁：把 Benchmark 案例数字当成项目实测；把 CALCULATED 当 MEASURED；把未知量用默认数字填掉。

## 2. 当前工程领域覆盖

BLDC / 急停 / 堵转 / 米勒；EMC RE/CE；EMC BCI；EMC ESD；车载电源瞬态（ISO 7637 思路）；电源完整性；Signal Integrity / CAN-FD；器件替代；WCCA；WCCA + EOL Calibration；Thermal；Functional Safety；Reliability；DFM；Production / EOL；Cost；Schedule / VOI；Test Failure；Customer Requirement；Design Deviation。

## 3. 第3页“物理机理”怎么用

BLDC 才使用 P001~P018 专项模式库。其他领域使用对应 Domain Profile：

BCI：Iinj → 共模路径 → 敏感节点 → 功能异常 → Recovery。

RE/CE：开关边沿/PWM/DC-DC → 寄生耦合 → 共模/差模 → RE/CE 峰值。

ESD：放电 → 连接器/壳体 → TVS/回流 → 敏感节点 → MCU/CAN/ADC → 功能保持。

WCCA：公差/温漂/偏置/老化 → Extreme/RSS/MC → 样件分布 → EOL → Cpk/Ppk。

Thermal：功耗 → 热阻 → Tj → Rds(on)/参数漂移 → 正反馈。

Power Transient：脉冲 → 源阻抗/寄生 L/C → TVS/滤波/DC-DC → 内部电源轨 → Reset/功能。

替代料：Rds(on)/Qg/Qgd/tr/tf → 损耗 → Tj/SOA → EMC/可靠性/质量体系。

## 4. WCCA 工程化输入

推荐至少填写：

1. 实测初始误差；
2. 高温误差；
3. 客户/设计限值；
4. Shunt、AFE Offset、ADC Reference、温漂、老化等预算项；
5. 样本数；
6. 温度范围；
7. 任务寿命。

系统可在预算项至少有两项时计算一个简单的 Extreme 合成与 RSS 敏感性结果。这个 RSS 只代表“按当前输入、假设独立”的统计敏感性，不代表自动获得客户放行资格。

## 5. EMC BCI 工程化输入

推荐至少填写：

- 注入电流 Iinj；
- 敏感频点；
- 线束长度；
- 受扰节点；
- ADC/采样误差；
- CAN 错误帧；
- Recovery Time；
- 屏蔽、参考地、TVS、滤波的 A/B 状态；
- 原始波形/频谱。

最有价值的输出不是“通过/失败”四个字，而是：

> 注入电流 → 路径 → 敏感节点 → 功能状态 → 恢复时间。

## 6. 实际工程数据如何进入软件

### 手工

在“1. 统一工程输入 → 实测参数回填”直接填写。

字段旁边会标出 MEASURED / SPEC / CALCULATED / CONTEXT。CALCULATED 字段不可手工填写。

### CSV/TXT

推荐工程室直接把示波器/频谱/量产数据导出为 CSV。上传后点击“从已上传 CSV/TXT 自动提取数值”。系统只提取明确出现的数字，不猜。

### XLSX/PDF

可以作为证据附件留档。关键数字建议导出 CSV 再自动提取；这样最容易保持字段映射可追溯。

### Benchmark

系统中的典型案例值统一标记为 BENCHMARK，只能用于演示和理解流程。正式项目应在录入真实数据后把来源切换到 USER_MEASURED 或 IMPORTED。

## 7. 工程使用闭环

发现问题 → 建立工程问题 → 填 Spec/Actual/Condition/Environment → 上传原始证据 → 事实分层 → 物理机理 → 候选方案 → C-T-S-Q-L → VOI 验证 → 安全/可靠性 → 评审/回归 → RACI → EDR。

## 8. 数据可信度原则

### 可以相信

有明确来源的 MEASURED；项目基线中的 SPEC；由当前输入可复现的 CALCULATED。

### 不能直接相信

ASSUMPTION；UNKNOWN；Benchmark。

### 必须警惕

- 软件/AI给出的数字与原始波形不一致；
- 统计模型假设与真实相关性不一致；
- 只改变软件而没有验证物理根因；
- 只看 Pin-to-Pin；
- 只看常温；
- 只看单样件。

## 9. 本版稳定性处理

- 防止对象字段直接作为 React 子节点导致白屏；
- 防止历史数据结构导致 `.map()` / `.join()` / undefined 访问；
- 工况切换时阻止旧异步分析覆盖新工况；
- 非 BLDC 页面不再默认使用 BLDC 专项物理参数；
- 候选方案、为什么选/不选、24h计划和门禁均在非 BLDC 场景下重新生成；
- 输入完整度在第 0、1、3 页可见。

## 10. 典型真实工作示例

### EMC BCI

实验室给出 45MHz/100mA 异常 → 填入 Iinj、误差、Recovery → 上传原始 BCI 数据 → 第3页定位源/路径/敏感节点 → 第4/5页对比硬件整改、A/B隔离、软件临时措施 → 第6页选最有信息价值的实验 → 回填实验 → 再计算 → 第8页回归 → 第10页 EDR。

### WCCA + EOL

把 24 台样件的初始/高温误差、预算项、客户限值导入 → 看 Extreme/RSS 与实测分布 → 做 Calibration 前后对比 → 计算残余误差 → 评价 Cpk/Ppk → 决定能否进入量产。

### MOSFET 替代

输入 Datasheet + 实测 Rds/Qg/Qgd/SOA/Tj + PCN/PPAP → 第3页确认动态/热/SOA链 → 第4/5页比较替代、整改、临时放行 → 第6页确定最小验证集 → 第7页确认可靠性/功能安全 → 第8页形成回归矩阵 → 第10页受控归档。
