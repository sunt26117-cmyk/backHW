/**
 * 机器人关节方案文案：**唯一定义处**。
 *
 * 背景：dualTimelineEngine（双时间轴）与 robotJointExpert（关节专家）原先各自逐字复制了同一套
 * "T+24h 应急遏制 / 下一版永久纠正" 方案文字，改一处漏一处。现统一在此维护，两处只引用。
 * 约束：只搬位置，文字逐字不变；常量按其在方案里的角色命名（遏制/永久 × 策略/步骤/交付物/退出条件）。
 */

export const TIMELINE_CONTAINMENT_PHASE_TITLE = "T + 24h 紧急应急围堵 (Containment)";
export const JOINT_CONTAINMENT_STRATEGY = "软件反向间隙查表动态补偿 + 外挂独立双通道安全继电器箱过渡 + 加减速 S 曲线回馈削峰";
export const JOINT_CONTAINMENT_NO_RESPIN_NOTE = "无需重新制作驱动板卡，仅需测试柜加装外置安全过渡盒并刷写运动控制补丁固件。";
export const JOINT_CONTAINMENT_OWNERS = "运动控制算法负责人 (Motion Lead) & 功能安全工程师 (Safety Lead)";
export const JOINT_BACKLASH_CAL_STEP_TITLE = "1. 激光干涉仪标定与反向间隙补偿固件刷写";
export const JOINT_BACKLASH_CAL_STEP_DETAIL = "使用激光干涉仪测量各关节正反向定位滞环，将回程死区数据烧录入固件 EEPROM，开启过零反向补偿与前馈平滑。";
export const JOINT_BACKLASH_PATCH_DELIVERABLE = "反向补偿固件补丁 (V1.2-Backlash-Patch) 与干涉仪测试记录";
export const JOINT_SAFETY_RELAY_STEP_TITLE = "2. 外接 TÜV 认证双通道干簧安全继电器过渡箱";
export const JOINT_SAFETY_RELAY_STEP_DETAIL = "在测试柜控制侧临时串接双通道独立干簧安全继电器模块，将 STO 1/2 彻底物理电气隔离切断驱动板 PWM 供电。";
export const JOINT_SCURVE_BLEED_STEP_TITLE = "3. 优化加减速 S 曲线并测试泄放电阻热平衡";
export const JOINT_BLEED_TEMP_RECORD_DELIVERABLE = "《连续满载运行泄放电阻温升曲线记录》";
export const JOINT_CONTAINMENT_EXIT_CRITERION = "第三方机构出具现场符合性预审合格备忘录，DVT 样机具备装车试运行放行资格。";
export const JOINT_PERMANENT_PHASE_TITLE = "下一批次 PCB 改版 / 量产定型阶段";
export const JOINT_PERMANENT_STRATEGY = "驱动板 Layout 双通道绝对物理隔离 (STO PLd) + 双编码器全闭环 + 功率泄放电阻外壳导热优化";
export const JOINT_PERMANENT_BENEFIT = "从单板硬件物理架构与机械传动链彻底消除背隙、共因失效及热过载隐患，顺利通过正式 TÜV 认证并支撑大规模量产。";
export const JOINT_PERMANENT_RESPIN_SCOPE = "PCB 重新 Layout 投板，升级光耦器件并重划隔离地岛；关节输出端加装第二编码器。";
export const JOINT_LAYOUT_ISOLATION_STEP_TITLE = "1. PCB 驱动控制板双通道绝对物理隔离 Layout";
export const JOINT_LAYOUT_ISOLATION_DELIVERABLE = "新版 Gerber 文件与安规绝缘仿真分析报告";
export const JOINT_DUAL_ENCODER_STEP_TITLE = "2. 关节输出侧集成 19-bit 绝对值双编码器全闭环";
export const JOINT_DUAL_ENCODER_STEP_DETAIL = "在谐波减速器输出法兰加装高精度第二码盘，驱动器形成电机高速端与负载低速端双闭环控制，物理消除机械背隙与扭转柔性。";
export const JOINT_DUAL_ENCODER_DELIVERABLE = "双码盘集成图纸与首件全闭环精度测试报告";
export const JOINT_BLEED_RELOCATE_STEP_TITLE = "3. 制动泄放电阻外移贴附铝合金外壳强化散热";
export const JOINT_PERMANENT_EXIT_CRITERION = "取得正式 PLd 功能安全证书，通过客户 SOP PPAP 签收。";
