/**
 * 5. 位置传感器失效降级与功能安全判定 (Position Sensor Failure Degradation)
 */
export function evaluatePositionSensorDegradation(sensorType: 'hall_triple' | 'hall_single' | 'optical_encoder' | 'sensorless'): {
  redundancyAvailable: boolean;
  switchingLogic: string;
  performanceLoss: string;
  dtcTriggered: string;
  powerLimitMode: string;
  dfmeaSeverity: number;
  dfmeaOccurrence: number;
  dfmeaDetection: number;
} {
  switch (sensorType) {
    case 'hall_triple':
      return {
        redundancyAvailable: true,
        switchingLogic: '三路霍尔中若单路断线/卡高/卡低，由 MCU 状态机通过捕获另外两路正交跳变沿并结合反电势/积分重构丢失相信号 (2-Hall 容错算法)。',
        performanceLoss: '转矩纹波增加约 15%，低速平稳性下降，峰值转速限幅至额定 70%。',
        dtcTriggered: 'DTC P0A3F-14 (Motor Rotor Position Sensor Circuit Low / Component Failure)',
        powerLimitMode: '激活限扭矩 50% Limp-Home 降级模式，禁用高动态响应操作。',
        dfmeaSeverity: 8, // 涉及座舱动作失效
        dfmeaOccurrence: 4, // 车规霍尔成熟
        dfmeaDetection: 3,  // 状态机实时奇偶校验
      };
    case 'hall_single':
      return {
        redundancyAvailable: false,
        switchingLogic: '单路霍尔一旦失效失去全部正交相位基准，无法通过硬件重构转子绝对位置。',
        performanceLoss: '无法维持矢量闭环控制，电机发生停转震颤。',
        dtcTriggered: 'DTC P0A38-00 (Motor Rotor Position Sensor Signal Missing)',
        powerLimitMode: '立即切入安全状态 (Safe State)：全关断 6-MOSFET 或根据急停需求实施三相全下桥动态制动。',
        dfmeaSeverity: 9,
        dfmeaOccurrence: 5,
        dfmeaDetection: 4,
      };
    case 'optical_encoder':
      return {
        redundancyAvailable: true,
        switchingLogic: 'ABZ 增量式编码器若 Z 相丢失，使用 AB 正交脉冲计数维持相对位置；若 A/B 任一相丢失，平滑切入反电势磁链观测器闭环。',
        performanceLoss: '角度分辨率由 12-bit 降为估算精度，稳态转速波动增加 ±30rpm。',
        dtcTriggered: 'DTC P0A40-1C (Rotor Position Sensor Optical Channel Voltage Out of Range)',
        powerLimitMode: '限制加速度斜坡上限，转速上限钳制 2500rpm。',
        dfmeaSeverity: 8,
        dfmeaOccurrence: 4,
        dfmeaDetection: 2,
      };
    case 'sensorless':
    default:
      return {
        redundancyAvailable: false,
        switchingLogic: '采用高频注入法 (HFI) 与滑模观测器 (SMO) 组合估算，当注入高频电流响应畸变时无法提取凸极率。',
        performanceLoss: '零速启动可能产生反冲反转，堵转状态无法建立磁场反电势。',
        dtcTriggered: 'DTC P0A44-77 (Sensorless Commutation Estimator Loss of Synchronization)',
        powerLimitMode: '重试 3 次启动失败后强制封锁驱动输出，报失步故障并锁止执行器。',
        dfmeaSeverity: 8,
        dfmeaOccurrence: 6,
        dfmeaDetection: 4,
      };
  }
}
