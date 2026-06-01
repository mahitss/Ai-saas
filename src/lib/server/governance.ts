type GovernanceLog = {
  id: string;
  userId: string;
  timestamp: string;
  direction: "input" | "output";
  model: string;
  policyFlags: string[];
  piiFound: boolean;
  piiTypes: string[];
  redactedText: string;
  rationale: string;
  aiBom: {
    model: string;
    datasets: string[];
    apis: string[];
  };
};

const logs: GovernanceLog[] = [];
const MAX_GOVERNANCE_LOGS = 300;

const PII_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { type: "credit_card", pattern: /\b(?:\d[ -]*?){13,19}\b/g },
  { type: "ssn", pattern: /\b\d{3}-?\d{2}-?\d{4}\b/g },
  { type: "phone", pattern: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g },
  { type: "secret", pattern: /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*[^\s"'`]+/gi },
];

function detectPolicyFlags(text: string) {
  const flags: string[] = [];
  if (/(password|api key|secret|token)/i.test(text)) flags.push("secret_exposure_risk");
  if (/(ssn|credit card|account number)/i.test(text)) flags.push("high_pii_risk");
  if (/(illegal|bypass|jailbreak|hack)/i.test(text)) flags.push("policy_violation_risk");
  return flags;
}

function piiLikely(text: string) {
  return detectPiiTypes(text).length > 0;
}

function detectPiiTypes(text: string) {
  return PII_PATTERNS.filter(({ pattern }) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  }).map(({ type }) => type);
}

function redactPii(text: string) {
  return PII_PATTERNS.reduce((next, { type, pattern }) => {
    pattern.lastIndex = 0;
    return next.replace(pattern, `[redacted:${type}]`);
  }, text);
}

export function inspectForGovernance(params: {
  userId: string;
  direction: "input" | "output";
  text: string;
  model: string;
  routeContext: string;
}) {
  const policyFlags = detectPolicyFlags(params.text);
  const piiTypes = detectPiiTypes(params.text);
  const piiFound = piiLikely(params.text);
  const id = `gov_${crypto.randomUUID().slice(0, 8)}`;
  const log: GovernanceLog = {
    id,
    userId: params.userId,
    timestamp: new Date().toISOString(),
    direction: params.direction,
    model: params.model,
    policyFlags,
    piiFound,
    piiTypes,
    redactedText: redactPii(params.text).slice(0, 2_000),
    rationale: `${params.routeContext}: ${policyFlags.length > 0 ? "flagged controls" : "no major policy flags"}`,
    aiBom: {
      model: params.model,
      datasets: ["user-memory", "conversation-history", "uploaded-knowledge"],
      apis: ["openai-responses", "google-generative-language", "internal-policy-gateway"],
    },
  };
  logs.unshift(log);
  if (logs.length > MAX_GOVERNANCE_LOGS) logs.length = MAX_GOVERNANCE_LOGS;
  return log;
}

export function getGovernanceLogs(userId: string) {
  return logs.filter((item) => item.userId === userId).slice(0, 100);
}
