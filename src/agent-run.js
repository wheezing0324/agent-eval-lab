const nowIso = () => new Date().toISOString();

const agentRun = ({
  id,
  name,
  role,
  status = "completed",
  inputSummary = "",
  outputSummary = "",
  startedAt,
  confidence = 0.8,
  artifacts = {},
  error = ""
}) => ({
  id,
  name,
  role,
  status,
  inputSummary: String(inputSummary || "").slice(0, 260),
  outputSummary: String(outputSummary || error || "").slice(0, 360),
  startedAt: startedAt || nowIso(),
  finishedAt: nowIso(),
  confidence: Math.max(0, Math.min(1, Number(confidence || 0))),
  artifacts,
  ...(error ? { error } : {})
});

const failedAgentRun = ({ id, name, role, inputSummary, startedAt, error, artifacts = {} }) =>
  agentRun({
    id,
    name,
    role,
    status: "failed",
    inputSummary,
    outputSummary: "该 Agent 调用失败，系统已保留规则快评兜底结果。",
    startedAt,
    confidence: 0,
    artifacts,
    error: error.message || String(error)
  });

module.exports = {
  nowIso,
  agentRun,
  failedAgentRun
};
