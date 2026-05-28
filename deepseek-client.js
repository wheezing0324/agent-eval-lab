const fs = require("fs");
const http = require("http");
const https = require("https");

const SYSTEM_CA_PATH = "/etc/ssl/cert.pem";

const PROVIDER_PRESETS = {
  deepseek: {
    provider: "deepseek",
    apiKind: "openai",
    label: "DeepSeek",
    displayName: "DeepSeek V4 Pro",
    model: "deepseek-v4-pro",
    baseUrl: "https://api.deepseek.com",
    thinking: "disabled",
    jsonMode: true
  },
  openai: {
    provider: "openai",
    apiKind: "openai",
    label: "OpenAI",
    displayName: "OpenAI GPT-4.1",
    model: "gpt-4.1",
    baseUrl: "https://api.openai.com/v1",
    jsonMode: true
  },
  anthropic: {
    provider: "anthropic",
    apiKind: "anthropic",
    label: "Anthropic Claude",
    displayName: "Claude Sonnet",
    model: "claude-3-5-sonnet-latest",
    baseUrl: "https://api.anthropic.com",
    jsonMode: false
  },
  gemini: {
    provider: "gemini",
    apiKind: "openai",
    label: "Google Gemini",
    displayName: "Gemini",
    model: "gemini-1.5-pro",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    jsonMode: false
  },
  qwen: {
    provider: "qwen",
    apiKind: "openai",
    label: "通义千问",
    displayName: "Qwen Plus",
    model: "qwen-plus",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    jsonMode: true
  },
  kimi: {
    provider: "kimi",
    apiKind: "openai",
    label: "Moonshot Kimi",
    displayName: "Kimi",
    model: "moonshot-v1-8k",
    baseUrl: "https://api.moonshot.cn/v1",
    jsonMode: false
  },
  zhipu: {
    provider: "zhipu",
    apiKind: "openai",
    label: "智谱 GLM",
    displayName: "GLM",
    model: "glm-4-plus",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    jsonMode: false
  },
  doubao: {
    provider: "doubao",
    apiKind: "openai",
    label: "豆包 Ark",
    displayName: "豆包",
    model: "doubao-1-5-pro-32k",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    jsonMode: false
  },
  siliconflow: {
    provider: "siliconflow",
    apiKind: "openai",
    label: "SiliconFlow",
    displayName: "SiliconFlow",
    model: "Qwen/Qwen2.5-72B-Instruct",
    baseUrl: "https://api.siliconflow.cn/v1",
    jsonMode: false
  },
  openrouter: {
    provider: "openrouter",
    apiKind: "openai",
    label: "OpenRouter",
    displayName: "OpenRouter",
    model: "openai/gpt-4o-mini",
    baseUrl: "https://openrouter.ai/api/v1",
    jsonMode: false
  },
  "custom-openai": {
    provider: "custom-openai",
    apiKind: "openai",
    label: "自定义 OpenAI-compatible",
    displayName: "Custom Model",
    model: "",
    baseUrl: "",
    jsonMode: false
  }
};

const modelConfig = PROVIDER_PRESETS.deepseek;

const stripCodeFence = (text) =>
  String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();

const parseJsonContent = (text) => {
  const fenced = stripCodeFence(text);
  const objectMatch = fenced.match(/\{[\s\S]*\}/);
  const cleaned = objectMatch ? objectMatch[0] : fenced;
  try {
    return JSON.parse(cleaned);
  } catch {
    return { rawText: text };
  }
};

const sanitizeProvider = (provider) => {
  const id = String(provider || "deepseek").trim();
  return PROVIDER_PRESETS[id] ? id : "custom-openai";
};

const normalizeBaseUrl = (baseUrl) => {
  const value = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!value) return "";
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("平台工作模型 Base URL 无效");
  }
  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new Error("平台工作模型 Base URL 只支持 http 或 https");
  }
  return value;
};

const normalizeModelTarget = (target = {}) => {
  const provider = sanitizeProvider(target.provider);
  const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS["custom-openai"];
  const baseUrl = normalizeBaseUrl(target.baseUrl || preset.baseUrl);
  const model = String(target.model || preset.model || "").trim();
  if (!model) throw new Error("平台工作模型 Model ID 不能为空");
  if (!baseUrl) throw new Error("平台工作模型 Base URL 不能为空");
  return {
    ...preset,
    ...target,
    provider,
    apiKind: target.apiKind || preset.apiKind || "openai",
    label: target.label || preset.label,
    displayName: target.displayName || preset.displayName || model,
    model,
    baseUrl,
    thinking: target.thinking === undefined ? preset.thinking : target.thinking,
    jsonMode: target.jsonMode === undefined ? preset.jsonMode : target.jsonMode
  };
};

const getModelStatus = ({ hasApiKey = false, target = {} } = {}) => {
  const normalized = normalizeModelTarget(target);
  return {
    provider: normalized.provider,
    label: normalized.label,
    displayName: normalized.displayName,
    model: normalized.model,
    baseUrl: normalized.baseUrl,
    apiKind: normalized.apiKind,
    enabled: hasApiKey,
    hasApiKey,
    keyMode: "browser-session-header",
    presets: Object.values(PROVIDER_PRESETS).map((item) => ({
      provider: item.provider,
      label: item.label,
      displayName: item.displayName,
      model: item.model,
      baseUrl: item.baseUrl,
      apiKind: item.apiKind
    })),
    pipeline: [
      { id: "task-parser", label: "任务指令解析", model: normalized.displayName },
      { id: "user-simulator", label: "用户模拟器", model: normalized.displayName },
      { id: "agent-reply", label: "被测 Agent 回复", model: normalized.displayName },
      { id: "report-writer", label: "报告解释与建议", model: normalized.displayName },
      { id: "rule-engine", label: "证据评分裁决", model: "本地规则引擎" }
    ]
  };
};

const chatCompletionsUrl = (baseUrl) => {
  const trimmed = normalizeBaseUrl(baseUrl);
  return trimmed.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
};

const anthropicMessagesUrl = (baseUrl) => {
  const trimmed = normalizeBaseUrl(baseUrl);
  return trimmed.endsWith("/messages") ? trimmed : `${trimmed}/v1/messages`;
};

const requestOptions = (targetUrl, headers, body) => {
  const url = new URL(targetUrl);
  const options = {
    method: "POST",
    hostname: url.hostname,
    path: `${url.pathname}${url.search}`,
    headers: {
      ...headers,
      "Content-Length": Buffer.byteLength(body)
    }
  };

  if (url.protocol === "https:" && fs.existsSync(SYSTEM_CA_PATH)) {
    options.ca = fs.readFileSync(SYSTEM_CA_PATH);
  }

  return options;
};

const postJsonOnce = (targetUrl, headers, payload, timeoutMs = 30000) =>
  new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    let settled = false;
    const target = new URL(targetUrl);
    const transport = target.protocol === "http:" ? http : https;
    const request = transport.request(requestOptions(targetUrl, headers, body), (response) => {
      let content = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        content += chunk;
      });
      response.on("end", () => {
        if (settled) return;
        settled = true;
        let json = {};
        try {
          json = content ? JSON.parse(content) : {};
        } catch {
          reject(new Error("模型接口返回了无法解析的响应"));
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const detail = json.error?.message || json.message || `HTTP ${response.statusCode}`;
          reject(new Error(`模型接口调用失败：${detail}`));
          return;
        }
        resolve(json);
      });
    });

    request.setTimeout(timeoutMs, () => {
      if (settled) return;
      settled = true;
      request.destroy();
      reject(new Error(`模型接口调用超时：超过 ${Math.round(timeoutMs / 1000)} 秒未返回`));
    });
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    request.end(body);
  });

const postJson = async (targetUrl, headers, payload, timeoutMs = 30000, retries = 1) => {
  try {
    return await postJsonOnce(targetUrl, headers, payload, timeoutMs);
  } catch (error) {
    const retryable = /socket|TLS|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(error.message);
    if (!retries || !retryable) throw error;
    await new Promise((resolve) => setTimeout(resolve, 700));
    return postJson(targetUrl, headers, payload, timeoutMs, retries - 1);
  }
};

const openAiHeaders = (apiKey) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${apiKey}`
});

const anthropicHeaders = (apiKey) => ({
  "Content-Type": "application/json",
  "x-api-key": apiKey,
  "anthropic-version": "2023-06-01"
});

const splitSystemMessages = (messages = []) => {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const rest = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: String(message.content || "")
    }));
  return { system, messages: rest };
};

const callOpenAiCompatible = async ({ target, apiKey, messages, temperature, responseFormat, maxTokens, timeoutMs, thinking }) => {
  const payload = Object.fromEntries(
    Object.entries({
      model: target.model,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: responseFormat === "json" && target.jsonMode ? { type: "json_object" } : undefined,
      thinking: thinking ? { type: thinking } : undefined
    }).filter(([, value]) => value !== undefined)
  );
  const data = await postJson(chatCompletionsUrl(target.baseUrl), openAiHeaders(apiKey), payload, timeoutMs);
  const content = data.choices?.[0]?.message?.content || "";
  return { content, usage: data.usage || null };
};

const callAnthropic = async ({ target, apiKey, messages, temperature, maxTokens, timeoutMs }) => {
  const split = splitSystemMessages(messages);
  const payload = Object.fromEntries(
    Object.entries({
      model: target.model,
      system: split.system || undefined,
      messages: split.messages,
      temperature,
      max_tokens: maxTokens
    }).filter(([, value]) => value !== undefined)
  );
  const data = await postJson(anthropicMessagesUrl(target.baseUrl), anthropicHeaders(apiKey), payload, timeoutMs);
  const content = (data.content || [])
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
  return { content, usage: data.usage || null };
};

const callDeepSeek = async ({
  apiKey,
  provider,
  baseUrl,
  model,
  displayName,
  apiKind,
  messages,
  temperature = 0.2,
  responseFormat = "text",
  maxTokens = 1200,
  timeoutMs = 30000,
  thinking
}) => {
  if (!apiKey) {
    throw new Error("模型 API 未配置：请在前端输入 API Key，本地后端不会保存密钥");
  }
  const target = normalizeModelTarget({ provider, baseUrl, model, displayName, apiKind, thinking });
  const result =
    target.apiKind === "anthropic"
      ? await callAnthropic({ target, apiKey, messages, temperature, maxTokens, timeoutMs })
      : await callOpenAiCompatible({
          target,
          apiKey,
          messages,
          temperature,
          responseFormat,
          maxTokens,
          timeoutMs,
          thinking: thinking === undefined ? target.thinking : thinking
        });

  return {
    provider: target.provider,
    model: target.model,
    displayName: target.displayName,
    content: result.content,
    json: responseFormat === "json" ? parseJsonContent(result.content) : null,
    usage: result.usage
  };
};

const parseOpenAiSse = (line) => {
  if (!line.startsWith("data:")) return null;
  const data = line.slice(5).trim();
  if (!data || data === "[DONE]") return null;
  const json = JSON.parse(data);
  return {
    delta: json.choices?.[0]?.delta?.content || "",
    usage: json.usage || null
  };
};

const parseAnthropicSse = (line) => {
  if (!line.startsWith("data:")) return null;
  const data = line.slice(5).trim();
  if (!data || data === "[DONE]") return null;
  const json = JSON.parse(data);
  if (json.type === "content_block_delta") {
    return { delta: json.delta?.text || "", usage: null };
  }
  if (json.type === "message_delta") {
    return { delta: "", usage: json.usage || null };
  }
  return { delta: "", usage: null };
};

const streamWithSse = ({ targetUrl, headers, payload, timeoutMs, parseLine, onContent }) =>
  new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    let settled = false;
    let eventBuffer = "";
    let content = "";
    let usage = null;
    const target = new URL(targetUrl);
    const transport = target.protocol === "http:" ? http : https;
    const request = transport.request(requestOptions(targetUrl, headers, body), (response) => {
      let errorBody = "";
      response.setEncoding("utf8");

      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.on("data", (chunk) => {
          errorBody += chunk;
        });
        response.on("end", () => {
          if (settled) return;
          settled = true;
          let detail = `HTTP ${response.statusCode}`;
          try {
            const json = JSON.parse(errorBody);
            detail = json.error?.message || json.message || detail;
          } catch {}
          reject(new Error(`模型接口流式调用失败：${detail}`));
        });
        return;
      }

      response.on("data", (chunk) => {
        eventBuffer += chunk;
        const lines = eventBuffer.split(/\r?\n/);
        eventBuffer = lines.pop() || "";
        lines.forEach((line) => {
          try {
            const parsed = parseLine(line);
            if (!parsed) return;
            if (parsed.delta) {
              content += parsed.delta;
              onContent?.(parsed.delta, content);
            }
            if (parsed.usage) usage = parsed.usage;
          } catch (error) {
            if (!settled) {
              settled = true;
              request.destroy();
              reject(new Error(`模型接口流解析失败：${error.message}`));
            }
          }
        });
      });
      response.on("end", () => {
        if (settled) return;
        settled = true;
        resolve({ content, usage });
      });
    });

    request.setTimeout(timeoutMs, () => {
      if (settled) return;
      settled = true;
      request.destroy();
      reject(new Error(`模型接口流式调用超时：超过 ${Math.round(timeoutMs / 1000)} 秒未返回`));
    });
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    request.end(body);
  });

const streamDeepSeek = async ({
  apiKey,
  provider,
  baseUrl,
  model,
  displayName,
  apiKind,
  messages,
  temperature = 0.2,
  maxTokens = 3200,
  timeoutMs = 150000,
  thinking,
  includeUsage = true,
  onContent
}) => {
  if (!apiKey) {
    throw new Error("模型 API 未配置：请在前端输入 API Key，本地后端不会保存密钥");
  }
  const target = normalizeModelTarget({ provider, baseUrl, model, displayName, apiKind, thinking });
  let result;

  if (target.apiKind === "anthropic") {
    const split = splitSystemMessages(messages);
    result = await streamWithSse({
      targetUrl: anthropicMessagesUrl(target.baseUrl),
      headers: anthropicHeaders(apiKey),
      payload: Object.fromEntries(
        Object.entries({
          model: target.model,
          system: split.system || undefined,
          messages: split.messages,
          temperature,
          max_tokens: maxTokens,
          stream: true
        }).filter(([, value]) => value !== undefined)
      ),
      timeoutMs,
      parseLine: parseAnthropicSse,
      onContent
    });
  } else {
    result = await streamWithSse({
      targetUrl: chatCompletionsUrl(target.baseUrl),
      headers: openAiHeaders(apiKey),
      payload: Object.fromEntries(
        Object.entries({
          model: target.model,
          messages,
          temperature,
          max_tokens: maxTokens,
          thinking: thinking ? { type: thinking } : undefined,
          stream: true,
          stream_options: includeUsage ? { include_usage: true } : undefined
        }).filter(([, value]) => value !== undefined)
      ),
      timeoutMs,
      parseLine: parseOpenAiSse,
      onContent
    });
  }

  return {
    provider: target.provider,
    model: target.model,
    displayName: target.displayName,
    content: result.content,
    usage: result.usage
  };
};

module.exports = {
  callDeepSeek,
  streamDeepSeek,
  getModelStatus,
  modelConfig,
  PROVIDER_PRESETS,
  normalizeModelTarget
};
