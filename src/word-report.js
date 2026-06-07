const escapeWordHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const reportItems = (value) => (Array.isArray(value) ? value : []);

const wordRows = (items, columns, emptyText) =>
  items.length
    ? items
        .map((item) => `<tr>${columns.map((column) => `<td>${escapeWordHtml(column(item))}</td>`).join("")}</tr>`)
        .join("")
    : `<tr><td colspan="${columns.length}">${escapeWordHtml(emptyText)}</td></tr>`;

const wordList = (items, emptyText) =>
  items.length
    ? `<ul>${items.map((item) => `<li>${escapeWordHtml(item)}</li>`).join("")}</ul>`
    : `<p>${escapeWordHtml(emptyText)}</p>`;

const traceWordState = (item) => {
  if (item.state === "risk") return "风险";
  if (item.state === "track") return "追踪";
  if (item.passed) return "命中";
  if (Number(item.points) > 0) return `扣分 -${item.points}`;
  return "追踪";
};

const buildWordReportHtml = (data = {}) => {
  const deductions = reportItems(data.deductions).filter((item) => Number(item.points) > 0);
  const evidence = reportItems(data.evidence).filter((item) => item.type !== "hit");
  const dimensions = reportItems(data.score?.dimensions);
  const recommendations = reportItems(data.report?.recommendations);
  const transcript = reportItems(data.transcript);
  const trace = reportItems(data.engineTrace);
  const agentRuns = reportItems(data.agentRuns);
  const observerTrace = reportItems(data.observerTrace);
  const complianceFindings = reportItems(data.complianceFindings);
  const reviewFindings = reportItems(data.reviewFindings);
  const exportedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  const reportTitle = data.report?.title || `${data.title || "CallEval"} 自动评测报告`;

  return `<!doctype html>
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <title>${escapeWordHtml(reportTitle)}</title>
        <style>
          body { color: #172120; font: 12pt "Microsoft YaHei", "PingFang SC", Arial, sans-serif; line-height: 1.55; }
          h1 { color: #123132; font-size: 22pt; margin: 0 0 8pt; }
          h2 { color: #123132; border-bottom: 1pt solid #d7e0e0; font-size: 15pt; margin: 18pt 0 8pt; padding-bottom: 4pt; }
          p { margin: 5pt 0; }
          table { border-collapse: collapse; margin: 6pt 0 12pt; width: 100%; }
          th, td { border: 1pt solid #cfd9d8; padding: 6pt; text-align: left; vertical-align: top; }
          th { background: #eaf6f0; color: #123132; font-weight: bold; }
          .score { background: #f1f6fb; border: 1pt solid #cfe0ef; font-size: 16pt; font-weight: bold; padding: 10pt; }
          .muted { color: #5d6c70; }
        </style>
      </head>
      <body>
        <h1>${escapeWordHtml(reportTitle)}</h1>
        <p class="muted">导出时间：${escapeWordHtml(exportedAt)}</p>
        <p class="score">总分：${escapeWordHtml(data.score?.total ?? "--")}/100　结论：${escapeWordHtml(data.score?.verdict?.label || "--")}</p>
        <h2>任务信息</h2>
        <table>
          <tr><th>任务</th><td>${escapeWordHtml(data.title || "--")}</td><th>领域</th><td>${escapeWordHtml(data.domain || "--")}</td></tr>
          <tr><th>被测角色</th><td>${escapeWordHtml(data.agent || "--")}</td><th>核心目标</th><td>${escapeWordHtml(data.taskSpec?.goal || data.brief || "--")}</td></tr>
          <tr><th>被测 Provider</th><td>${escapeWordHtml(data.testedProvider || "deepseek")}</td><th>被测模型</th><td>${escapeWordHtml(data.testedModel || "deepseek-v4-pro")}</td></tr>
        </table>
        <h2>评估结论</h2>
        <p>${escapeWordHtml(data.report?.conclusion || "--")}</p>
        <h2>多 Agent 协作轨迹</h2>
        <table>
          <tr><th>Agent</th><th>状态</th><th>职责</th><th>产出摘要</th></tr>
          ${wordRows(agentRuns, [(item) => item.name || item.id || "--", (item) => item.status || "--", (item) => item.role || "--", (item) => item.outputSummary || "--"], "暂无 Agent 协作轨迹")}
        </table>
        <h2>对话监控 Agent 旁观结果</h2>
        <table>
          <tr><th>轮次</th><th>当前节点</th><th>风险</th><th>建议动作</th></tr>
          ${wordRows(observerTrace, [(item) => `第 ${item.turn || 0} 轮`, (item) => item.currentStep || "--", (item) => item.riskLevel || "--", (item) => item.suggestedNextAction || "--"], "暂无旁观结果")}
        </table>
        <h2>合规审查 / 复核 Agent 发现</h2>
        <table>
          <tr><th>来源</th><th>对象</th><th>结论</th><th>证据或原因</th></tr>
          ${wordRows(
            [
              ...complianceFindings.map((item) => ({ source: "合规审查 Agent", target: item.riskType, decision: item.passed ? "通过" : item.severity, reason: item.evidence })),
              ...reviewFindings.map((item) => ({ source: "复核 Agent", target: item.target, decision: item.decision, reason: item.reason }))
            ],
            [(item) => item.source, (item) => item.target || "--", (item) => item.decision || "--", (item) => item.reason || "--"],
            "暂无合规或复核发现"
          )}
        </table>
        <h2>分项评分</h2>
        <table>
          <tr><th>维度</th><th>得分</th><th>满分</th><th>占比</th></tr>
          ${wordRows(dimensions, [(item) => item.label, (item) => item.score, (item) => item.max, (item) => `${item.percent}%`], "暂无分项评分")}
        </table>
        <h2>扣分项</h2>
        <table>
          <tr><th>轮次</th><th>维度</th><th>扣分</th><th>原因</th></tr>
          ${wordRows(deductions, [(item) => `第 ${item.turn || 0} 轮`, (item) => item.dimension || "--", (item) => `-${item.points}`, (item) => item.reason || "--"], "未发现真实扣分项")}
        </table>
        <h2>扣分证据</h2>
        <table>
          <tr><th>轮次</th><th>类型</th><th>证据</th></tr>
          ${wordRows(evidence, [(item) => `第 ${item.turn || 0} 轮`, (item) => item.type || "--", (item) => item.text || "--"], "未发现明确扣分证据")}
        </table>
        <h2>评测轨迹</h2>
        <table>
          <tr><th>状态</th><th>维度</th><th>轨迹</th><th>证据</th></tr>
          ${wordRows(trace, [(item) => traceWordState(item), (item) => item.dimension || "--", (item) => item.label || "--", (item) => item.reason || "--"], "暂无评测轨迹")}
        </table>
        <h2>改进建议</h2>
        ${wordList(recommendations, "暂无改进建议")}
        <h2>完整对话</h2>
        <table>
          <tr><th>轮次</th><th>用户模拟 Agent</th><th>被测模型</th></tr>
          ${wordRows(transcript, [(item) => `第 ${item.turn || 0} 轮`, (item) => item.user || "--", (item) => item.agent || "--"], "暂无对话记录")}
        </table>
      </body>
    </html>`;
};

module.exports = {
  buildWordReportHtml
};
