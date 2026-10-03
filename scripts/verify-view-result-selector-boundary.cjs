const fs = require('fs');
const path = require('path');
const componentsDir = path.join(process.cwd(), 'src', 'components');
const files = fs.readdirSync(componentsDir).filter(f => /\.(tsx|ts)$/.test(f));
const forbidden = /\bresult\??\.(?:coreConclusion|riskRatings|knownFacts|assumptions|unknowns|physicalMechanism|dfmeaView|dfmeaItems|candidateActions|finalRecommendation|raciMatrix|containment|capa|engineeringDocs|dualTimeline|bldcExtendedAnalysis|classifiedInfo|multiRiskBreakdown|whyNotComparison|next24HourPlan|edrRecord|redTeamChallenge|templateContentNotice|analysisInputFingerprint|context|source|provenance|analysisBasis|citedFields|multiDomainAnalysis|decisionFrame|inputIntegrity|aiAudit|debugSnapshot)\b/;
const offenders = [];
for (const file of files) {
  if (file === 'MotorDriveToolbox.tsx') continue;
  const text = fs.readFileSync(path.join(componentsDir, file), 'utf8');
  if (forbidden.test(text)) offenders.push(file);
}
if (offenders.length) {
  console.error('VIEW_RESULT_SELECTOR_BOUNDARY_FAIL');
  offenders.forEach(x => console.error(`FAIL ${x}`));
  process.exit(1);
}
console.log(`VIEW_RESULT_SELECTOR_BOUNDARY_PASS ${files.length - 1}/${files.length - 1}`);
