# WP5 · 计算器边界与去套娃结果

## 目标

`EngineeringCalculatorView` 负责通用工程计算；`MotorDriveToolbox` 负责 BLDC / 电机驱动专项机理核算。两者不再以“两个完整计算器互相嵌套”的方式组织。

## 功能盘点

| 模块 | 归属 | 与通用计算器关系 | WP5处理 |
|---|---|---|---|
| WCCA / RSS / Monte Carlo | EngineeringCalculatorView | 独立 | 保留 |
| 瞬态 Foster RC / 脉冲结温 | EngineeringCalculatorView | 与堵转热在“瞬态热”概念上重叠，但参数边界不同 | 不删公式，不合并结果 |
| 稳态结温 / 降额 | EngineeringCalculatorView | 通用热边界 | 保留 |
| 电源轨动态跌落 / 复位裕量 | EngineeringCalculatorView | 通用电源裕量 | 保留 |
| 母线泵升 | MotorDriveToolbox | BLDC 机械能回馈特有 | 保留在专项工具 |
| Miller 直通风险 | MotorDriveToolbox | 不重复 | 保留 |
| Snubber 参数推荐 | MotorDriveToolbox | 不重复 | 保留 |
| 堵转瞬态热 | MotorDriveToolbox | 与 Foster 计算在方法层相关 | 保留专项入口，未改公式 |
| 换相角/失步 | MotorDriveToolbox | 不重复 | 保留 |
| 位置传感器降级 | MotorDriveToolbox | 不重复 | 保留 |
| 功能安全链时序 | MotorDriveToolbox | 不重复 | 保留 |

## 结构变化

- `EngineeringCalculatorView` 不再把 `MotorDriveToolbox` 当作第四/第五个平级标签页。
- BLDC 专项工具改为默认折叠卡片，只有需要时才挂载。
- `MotorDriveToolbox` 内的“座椅 / 滑屏 / 按摩泵 / 机器人”快捷预设已删除，典型工况唯一入口回到全局 Scenario Manager。
- 未改变任何物理公式或结果函数签名。

## 输入边界

已绑定到当前 `IssueInput` 的专项输入可以回填当前工程；没有结构化字段承载的专项模块仍属于独立 What-if 计算。它们不能被解释成当前工程已测事实，也不能成为 AI 的当前事实来源。
