const { normalizeModelTarget } = require("../deepseek-client");
const { cases } = require("../data/eval-cases");

const getCaseById = (id) => cases.find((testCase) => testCase.id === id) || cases[0];

const compactCase = (testCase) => ({
  id: testCase.id,
  title: testCase.title,
  agent: testCase.agent,
  domain: testCase.domain,
  brief: testCase.brief,
  taskSpec: testCase.taskSpec
});

const compactTask = (task) => ({
  id: String(task?.id || "submitted_task").slice(0, 80),
  title: String(task?.title || "用户提交外呼任务").slice(0, 120),
  agent: String(task?.agent || task?.role || "外呼 Agent").slice(0, 120),
  domain: String(task?.domain || "平台模型解析任务").slice(0, 120),
  brief: String(task?.brief || task?.taskSpec?.goal || "").slice(0, 1200),
  taskSpec: {
    goal: String(task?.taskSpec?.goal || "").slice(0, 600),
    requiredSteps: (task?.taskSpec?.requiredSteps || []).map((item) => String(item).slice(0, 120)).slice(0, 8),
    slots: (task?.taskSpec?.slots || []).map((item) => String(item).slice(0, 120)).slice(0, 8),
    constraints: (task?.taskSpec?.constraints || []).map((item) => String(item).slice(0, 160)).slice(0, 8),
    successCriteria: (task?.taskSpec?.successCriteria || []).map((item) => String(item).slice(0, 160)).slice(0, 8),
    branchRules: (task?.taskSpec?.branchRules || []).map((item) => String(item).slice(0, 180)).slice(0, 8)
  }
});

const taskFromBody = (body) => (body.task ? compactTask(body.task) : compactCase(getCaseById(body.case || "rider_fulfillment")));

const testedModelFromBody = (body) => {
  const model = String(body.testedModel || "deepseek-v4-pro").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(model)) {
    throw new Error("被测模型 Model ID 无效，请使用 1-120 位字母、数字、点、下划线、冒号、斜杠或短横线");
  }
  return model;
};

const testedTargetFromBody = (body, platformTarget = {}) => {
  const provider = String(body.testedProvider || "deepseek").trim();
  const model = testedModelFromBody(body);
  const baseUrl = String(body.testedBaseUrl || "").trim();
  const target = normalizeModelTarget({ provider, model, baseUrl });
  const apiKey = String(
    body.testedApiKey || (target.provider === platformTarget.provider ? platformTarget.apiKey : "") || ""
  ).trim();
  if (!apiKey) throw new Error("请填写被测模型 API Key，或选择与平台工作模型相同的 Provider 复用平台 Key");
  return {
    ...target,
    apiKey,
    thinking: target.thinking
  };
};

const normalizeMaxTurns = (value) => Math.max(4, Math.min(Number(value || 10), 16));

const minimumDialogueTurns = (maxTurns) => Math.min(maxTurns, maxTurns >= 10 ? 6 : 4);

const platformCallOptions = (target = {}) => ({
  apiKey: target.apiKey,
  provider: target.provider,
  model: target.model,
  baseUrl: target.baseUrl,
  displayName: target.displayName,
  apiKind: target.apiKind,
  thinking: target.thinking
});

const transcriptText = (transcript = []) =>
  transcript.map((turn) => `第 ${turn.turn} 轮\n用户：${turn.user}\nAgent：${turn.agent}`).join("\n\n");

module.exports = {
  getCaseById,
  compactCase,
  compactTask,
  taskFromBody,
  testedModelFromBody,
  testedTargetFromBody,
  normalizeMaxTurns,
  minimumDialogueTurns,
  platformCallOptions,
  transcriptText
};
