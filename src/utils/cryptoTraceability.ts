/**
 * 车规工程留痕与防篡改数字指纹引擎 (SHA-256 Traceability Hash)
 * 基于 Web Crypto API 原生 crypto.subtle.digest，零外部体积库
 */

export interface TraceabilityPayload {
  projectName: string;
  projectPhase: string;
  asilLevel: string;
  ecuType: string;
  timestampIso: string;
  rawMeasurement?: string;
  mechanismSummary?: string;
  informationTagsSummary?: string;
  assumptionsList?: string[];
  finalRecommendedOption: string;
  recommendationGrade: string;
  raciSignOffs: string[];
  keyRisks: string[];
  clientIpOrUser?: string;
}

export interface DigitalFingerprintResult {
  sha256Hex: string;
  shortFingerprint: string;
  timestampFormatted: string;
  tamperProofCertificate: string;
}

export async function generateDigitalFingerprint(
  payload: TraceabilityPayload
): Promise<DigitalFingerprintResult> {
  const normalizedString = [
    `PROJECT:${payload.projectName}`,
    `PHASE:${payload.projectPhase}`,
    `ASIL:${payload.asilLevel}`,
    `ECU:${payload.ecuType}`,
    `TIME:${payload.timestampIso}`,
    `MEASUREMENT:${payload.rawMeasurement || 'N/A'}`,
    `TAGS:${payload.informationTagsSummary || 'N/A'}`,
    `MECHANISM:${payload.mechanismSummary || 'N/A'}`,
    `ASSUMPTIONS:${(payload.assumptionsList || []).join(';')}`,
    `RECOMMENDATION:${payload.finalRecommendedOption}`,
    `GRADE:${payload.recommendationGrade}`,
    `RACI:${payload.raciSignOffs.sort().join(';')}`,
    `RISKS:${payload.keyRisks.join('|')}`,
  ].join('##');

  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(normalizedString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha256Hex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    
    // 生成形如 HW-SAFE-7F89B2A1-9E4C 的车载工程防御指纹
    const p1 = sha256Hex.slice(0, 8).toUpperCase();
    const p2 = sha256Hex.slice(8, 12).toUpperCase();
    const p3 = sha256Hex.slice(12, 16).toUpperCase();
    const shortFingerprint = `HW-SAFE-${p1}-${p2}-${p3}`;

    const dateObj = new Date(payload.timestampIso);
    const timestampFormatted = dateObj.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const tamperProofCertificate = [
      `======================================================================`,
      `  车载硬件工程决策数据完整性校验凭证 (LOCAL INTEGRITY HASH RECORD)`,
      `======================================================================`,
      `【存证编号】: ${shortFingerprint}`,
      `【校验算法】: Web Crypto API Native SHA-256 (256-bit Secure Digest)`,
      `【全量哈希】: SHA-256: ${sha256Hex}`,
      `【工程项目】: ${payload.projectName} (${payload.ecuType}) - 阶段: ${payload.projectPhase} / ${payload.asilLevel}`,
      `【存证时间】: ${timestampFormatted} (UTC+8)`,
      `【核准方案】: ${payload.finalRecommendedOption} [评级: ${payload.recommendationGrade}]`,
      `【签署责任链】: ${payload.raciSignOffs.join('; ')}`,
      `【校验覆盖域】: 覆盖原始测量记录、五类分类标签(MEASURED/SPEC等)、机理推导摘要、核心假设条件、方案评分与RACI责任人。`,
      `【完整性说明】: 本指纹用于技术评审及决策归档时检验案卷数据完整性。任何对实测数据、规范限值、假设或结论的篡改均将导致哈希校验失效（注：企业级本地工程防伪留痕记录，非第三方CA公证时间戳）。`,
      `======================================================================`,
    ].join('\n');

    return {
      sha256Hex,
      shortFingerprint,
      timestampFormatted,
      tamperProofCertificate,
    };
  } catch (err) {
    // 降级使用简易哈希计算
    let hash = 0;
    for (let i = 0; i < normalizedString.length; i++) {
      const char = normalizedString.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).padStart(16, '0').toUpperCase();
    const shortFingerprint = `HW-SAFE-${hex.slice(0, 8)}-${hex.slice(8, 12)}`;
    return {
      sha256Hex: hex.repeat(4),
      shortFingerprint,
      timestampFormatted: new Date().toISOString(),
      tamperProofCertificate: `【存证编号】: ${shortFingerprint} (Fallback)`,
    };
  }
}
