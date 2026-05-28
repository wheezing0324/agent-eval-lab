# CallEval 呼评智测

CallEval 是一个面向黑客松赛题的独立 Demo，用来评估对话模型在复杂外呼任务中的表现。平台工作模型默认使用 **DeepSeek V4 Pro** 完成任务解析、场景生成和 Judge；被测 Agent 模型单独配置 Provider、Base URL、API Key 与 Model ID。状态追踪与最终扣分仍由本地规则引擎执行，保证评分有证据链、可复现。

## 功能

- 内置 5 个评测案例：旅行规划、客服退款、数据分析、骑手履约外呼、课程直播升级外呼。
- 展示多轮对话轨迹，包括用户模拟器输入和被测 Agent 回复。
- Node 后端实时执行规则评分，不依赖主观人工判断。
- 平台工作模型默认使用 DeepSeek V4 Pro，负责任务解析、用户场景生成和报告解释。
- 每个扣分点都绑定具体轮次，方便解释评测结果。
- API 返回 `signals`、`engineTrace`、`deductions`，可以看到预算、金额、追问、越权承诺、编造结论等信号如何影响分数。
- 输出总分、分项评分、风险结论、关键证据和改进建议。
- 后端不可用时，页面自动切换到静态 fallback，保证演示稳定。
- 任务输入与解析页支持粘贴任务内容或上传 `.xlsx` Excel，提取文本后提交 DeepSeek 解析。
- 自定义任务解析完成后，会继续生成用户场景、流式多轮对话和带证据的评测报告。
- 平台工作模型固定负责任务解析、场景和 Judge；被测模型可选 DeepSeek 或 OpenAI-compatible Provider，并单独填写 Base URL、API Key 与 Model ID。
- 页面展示后端抽取信号和规则引擎轨迹，方便解释评分不是静态结果。
- 可解释评估报告支持下载为 Word 可打开的 `.doc` 文件，包含分数、证据、轨迹、建议和完整对话。

## 页面结构

- 首页总览：展示任务库、系统定位和整体评测流程。
- 任务输入与解析：支持粘贴或载入任务文本，并展示角色、目标、流程、槽位和约束。
- 用户场景配置：展示配合型、忙碌型、拒绝型、质疑型等用户模拟场景。
- 多轮对话运行：左侧任务与用户画像，中间对话窗口，右侧实时状态追踪。
- 评估报告：展示总分、分项得分、扣分证据、规则轨迹和改进建议，并支持下载 Word 报告。

## 运行

```bash
cd agent-eval-lab
npm start
```

访问：

```text
http://127.0.0.1:4174
```

如果需要启用真实 DeepSeek API 调用，请在页面右上角的 `DeepSeek API Key` 输入框中填写。勾选“记住本浏览器”后，密钥会保存在当前浏览器的 `localStorage`，刷新页面或重启本地服务后仍会自动启用。密钥只会随需要调用模型的请求通过 `x-deepseek-api-key` 请求头转发到本地 Node 服务；后端不会保存密钥，也不会写入文件。

可选环境变量只用于非敏感配置：

```text
DEEPSEEK_BASE_URL=https://api.deepseek.com
PORT=4174
```

未在前端输入 API Key 时，页面仍可使用内置案例和本地规则评分稳定演示。

## API

```text
GET /api/cases
GET /api/evaluate?case=travel
GET /api/evaluate?case=refund
GET /api/evaluate?case=analysis
GET /api/model-status
POST /api/tasks/extract-xlsx
POST /api/reports/word
POST /api/deepseek/parse-task
POST /api/deepseek/scenarios
POST /api/deepseek/run-dialogue
POST /api/deepseek/run-dialogue-stream
POST /api/deepseek/judge-dialogue
POST /api/deepseek/simulate-user
POST /api/deepseek/agent-reply
POST /api/deepseek/report
```

平台 DeepSeek 调用接口需要从前端传入请求头：

```text
x-deepseek-api-key: 你的 DeepSeek Key
```

运行自定义对话时，被测模型配置随请求体提交：

```json
{
  "testedProvider": "openai-compatible",
  "testedBaseUrl": "https://provider.example/v1",
  "testedApiKey": "你的厂商 Key",
  "testedModel": "厂商提供的 Model ID"
}
```

`openai-compatible` Provider 走 Chat Completions 风格的 `model`、`messages` 和流式输出字段。选择 DeepSeek Provider 时，被测 API Key 可以留空，系统会复用页面右上角输入的 DeepSeek Key。

也可以提交自定义对话，让后端重新计算：

```bash
curl -X POST http://127.0.0.1:4174/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "case": "travel",
    "transcript": [
      {
        "turn": 1,
        "user": "我想去上海玩，预算 5000 元以内。",
        "agent": "建议总计约 6500 元。"
      }
    ]
  }'
```

## 评分维度

| 维度 | 权重 |
| --- | ---: |
| 任务完成度 | 30 |
| 指令遵循 | 25 |
| 多轮一致性 | 15 |
| 信息获取能力 | 10 |
| 错误恢复能力 | 10 |
| 安全与边界 | 5 |
| 报告可解释性 | 5 |

## Demo 讲解脚本

1. 先说明痛点：复杂多轮 Agent 任务很难只靠人工检查，成本高且不稳定。
2. 选择“旅行规划 Agent”，运行评测。
3. 展示第 3 轮证据：Agent 已经知道预算 5000 元，但仍输出 5800 元方案，因此扣分。
4. 展示第 4 轮证据：用户纠错后 Agent 能恢复到 4960 元方案，所以错误恢复能力仍有分。
5. 打开“后端抽取信号”和“规则引擎轨迹”，说明预算、金额、主动追问等信号如何触发规则。
6. 提交一个自定义任务，展示系统生成用户场景、流式对话和可下载 Word 报告。
7. 切换到“骑手履约外呼 Agent”，说明系统能检查合同生效通知、配送任务、排名解释和短话术。
8. 切换到“课程直播升级外呼 Agent”，说明系统能检查极简话术、忙碌分支、低延迟推荐和优惠券边界。
9. 切换到“客服退款 Agent”或“数据分析 Agent”，说明规则引擎也可扩展到通用 Agent 任务。
10. 总结：这个 Demo 的价值不是替代最终人工评审，而是把评测过程结构化、量化、可追踪。

## 后续扩展

- 把当前 DeepSeek API 节点串成完整自动运行链路，现场实时生成用户和 Agent 多轮对话。
- 增加任务脚本编辑器，让评委现场配置新任务。
- 引入 LLM-as-Judge 时只用于主观质量补充评分，硬约束仍由规则引擎判断。
- 继续补充 JSON/PDF 与原生 `.docx` 评测报告导出。
