export const MOTOR_DRIVE_WHAT_IF_DEFAULTS = Object.freeze({
  busPumping: {
    V_bus_nom: 13.5,
    V_bus_max_rating: 40.0,
    C_dc_uF: 470,
    J_kg_m2: 0.00015,
    n_rpm: 3800,
    I_phase_A: 22.0,
    regenEfficiency: 0.8,
    L_harness_uH: 2.0,
  },
  miller: {
    V_th_min: 2.0,
    C_gd_pF: 45,
    C_gs_pF: 1800,
    R_g_pulldown_ohm: 4.5,
    dv_dt_V_per_ns: 8.5,
    hasActiveMillerClamp: false,
  },
  snubber: {
    f_ring_MHz: 48.0,
    C_oss_pF: 680,
    V_bus_V: 13.5,
    f_sw_kHz: 20,
  },
  stallThermal: {
    ambientTempC: 85,
    biasPowerW: 0.8,
    stallCurrentA: 28,
    rdson25mOhm: 3.2,
    stallDurationMs: 1500,
    tjMaxC: 175,
    tjDeratedLimitC: 140,
    packageType: 'POWERPAK56' as const,
  },
  commutation: {
    controlMode: 'hall_six_step' as 'sensorless_bemf' | 'hall_six_step' | 'foc_vector',
    speedMinRpm: 800,
    speedMaxRpm: 3800,
    angleOffsetDeg: 6.5,
    torqueFluctuationPct: 15,
  },
  sensorDegradation: {
    sensorType: 'hall_triple' as 'hall_triple' | 'hall_single' | 'optical_encoder' | 'sensorless',
  },
  safetyChain: {
    fhtiBudgetMs: 10.0,
    wdgTimeoutWindowMs: 4.0,
    safeStateTransitionMs: 2.2,
    currentSenseDeviationPct: 3.2,
  },
});

/**
 * These values are UI starting points for an isolated What-if calculation only.
 * They MUST NOT be treated as current engineering facts or copied into AI grounding
 * unless an engineer explicitly enters the value into IssueInput.
 */
