import { resolveStorageArea, storageGet, storageSet } from "./chromeStorage.js";

const DEFAULT_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const OPENAI_STORAGE_KEY = "agent:provider:openai";

const safeParseAction = (text) => {
  if (!text || typeof text !== "string") {
    return null;
  }

  const match = text.match(/```(json)?([\s\S]*?)```/i);
  const jsonBlock = match ? match[2] : text;

  try {
    const parsed = JSON.parse(jsonBlock.trim());
    if (parsed && typeof parsed === "object" && parsed.action && parsed.action.name) {
      return parsed.action;
    }
  } catch (error) {
    // Ignore JSON parse errors; caller can fall back to manual handling.
  }

  return null;
};

const buildRequestBody = ({ messages, model, options }) => ({
  model,
  messages: messages.map(({ role, content }) => ({ role, content })),
  temperature: options.temperature ?? 0.4,
  max_tokens: options.maxTokens ?? 2048,
  response_format: options.expectJson ? { type: "json_object" } : undefined,
});

const createOpenAIAdapter = ({ storageArea = "local", logger }) => {
  const area = resolveStorageArea(storageArea);

  const loadSettings = async () => {
    const settings = await storageGet(area, OPENAI_STORAGE_KEY);
    return settings ?? {};
  };

  const saveSettings = async (settings) => {
    await storageSet(area, { [OPENAI_STORAGE_KEY]: settings });
  };

  const invoke = async ({ role, config, messages, options = {} }) => {
    const settings = await loadSettings();
    const apiKey = options.apiKey ?? settings.apiKey;
    if (!apiKey) {
      throw new Error("OpenAI adapter requires an apiKey in storage or options");
    }

    const endpoint = settings.endpoint ?? DEFAULT_ENDPOINT;
    const model = config?.model ?? settings.model ?? "gpt-4o-mini";
    const requestBody = buildRequestBody({ messages, model, options });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorPayload = await response.text();
      throw new Error(`OpenAI request failed with status ${response.status}: ${errorPayload}`);
    }

    const payload = await response.json();
    const message = payload.choices?.[0]?.message?.content ?? "";
    const action = safeParseAction(message);

    logger?.info?.("OpenAI invocation", {
      role,
      model,
      usage: payload.usage,
    });

    return {
      text: message,
      action,
      raw: payload,
    };
  };

  const estimateTokens = ({ messages }) => {
    const chars = messages.reduce((acc, item) => acc + (item?.content?.length ?? 0), 0);
    return Math.ceil(chars / 4);
  };

  return {
    name: "openai",
    invoke,
    estimateTokens,
    loadSettings,
    saveSettings,
  };
};

export { createOpenAIAdapter };
