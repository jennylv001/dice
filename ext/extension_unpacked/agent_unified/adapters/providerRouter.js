/**
 * Multi-provider LLM router adapter.
 * Adapted from legacy agent's provider router with enhancements.
 * @implements {IProvider}
 */

const PROVIDER_CONFIG_KEY = "agent_unified:providers:config:v1";

const DEFAULT_ROLE_BINDINGS = {
  planner: {
    provider: "mock",
    model: "mock-planner",
    params: {
      temperature: 0.2,
    },
  },
  navigator: {
    provider: "mock",
    model: "mock-navigator",
    params: {
      temperature: 0.4,
    },
  },
};

/**
 * Resolves chrome.storage area
 */
function resolveStorageArea(area = "local") {
  if (typeof chrome === "undefined" || !chrome.storage) {
    throw new Error("[agent_unified/providerRouter] chrome.storage not available");
  }

  const storageArea = chrome.storage[area];
  if (!storageArea) {
    throw new Error(`[agent_unified/providerRouter] Unknown storage area: ${area}`);
  }

  return storageArea;
}

/**
 * Promisified storage operations
 */
async function storageGet(area, key) {
  return new Promise((resolve, reject) => {
    area.get(key, (result) => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result?.[key]);
      }
    });
  });
}

async function storageSet(area, items) {
  return new Promise((resolve, reject) => {
    area.set(items, () => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Normalize messages array
 */
const normalizeMessages = (messages) =>
  (messages ?? []).map((message) => ({
    role: message.role,
    content: String(message.content ?? ""),
  }));

/**
 * Parse inline action from text response
 */
const parseInlineAction = (text) => {
  if (!text || typeof text !== "string") {
    return null;
  }

  // Try JSON format: action: {...}
  const jsonMatch = text.match(/action\s*[:=]\s*({[\s\S]+?})/i);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed && parsed.name) {
        return {
          name: parsed.name,
          params: parsed.params ?? {},
        };
      }
    } catch (error) {
      // Ignore parse errors
    }
  }

  // Try directive format: action action-name
  const directiveMatch = text.match(/action\s+([a-z0-9-_]+)/i);
  if (directiveMatch) {
    return {
      name: directiveMatch[1],
      params: {},
    };
  }

  return null;
};

/**
 * Build default response structure
 */
const buildDefaultResponse = (result) => ({
  text: typeof result === "string" ? result : result?.text ?? "",
  action: result?.action ?? null,
  raw: result,
});

/**
 * Create mock adapter for testing/fallback
 */
const createMockAdapter = ({ logger } = {}) => ({
  name: "mock",
  
  async invoke({ role, messages, config, options }) {
    logger?.info?.("Mock provider invoked", { role, messageCount: messages.length });
    
    const mockResponse = {
      action: {
        name: "note",
        params: {
          text: `Mock response for role: ${role}`,
        },
      },
      reasoning: "This is a mock response. Configure a real LLM provider.",
    };

    if (options?.expectJson) {
      return {
        text: JSON.stringify(mockResponse),
        action: mockResponse.action,
        raw: mockResponse,
      };
    }

    return {
      text: `Mock response for ${role}: ${JSON.stringify(mockResponse.action)}`,
      action: mockResponse.action,
      raw: mockResponse,
    };
  },

  estimateTokens({ messages }) {
    return messages.reduce((sum, m) => sum + (m.content?.length ?? 0) / 4, 0);
  },
});

/**
 * Create provider router
 * @param {Object} options
 * @param {string} options.storageArea - Storage area name
 * @param {ILogger} options.logger - Logger instance
 * @returns {IProvider}
 */
export const createProviderRouter = ({ storageArea = "local", logger } = {}) => {
  const area = resolveStorageArea(storageArea);
  const adapters = new Map();

  // Register mock adapter
  adapters.set("mock", createMockAdapter({ logger }));

  // Dynamically import and register OpenAI adapter
  const lazyLoadOpenAI = async () => {
    try {
      const { createOpenAIAdapter } = await import("./openai.js");
      adapters.set("openai", createOpenAIAdapter({ storageArea: area, logger }));
      logger?.info?.("OpenAI adapter loaded");
    } catch (error) {
      logger?.warn?.("Failed to load OpenAI adapter", { error: error.message });
    }
  };

  const loadConfig = async () => {
    const stored = await storageGet(area, PROVIDER_CONFIG_KEY);
    if (!stored || typeof stored !== "object") {
      return { roles: { ...DEFAULT_ROLE_BINDINGS } };
    }

    return {
      roles: {
        ...DEFAULT_ROLE_BINDINGS,
        ...(stored.roles ?? {}),
      },
    };
  };

  const saveConfig = async (config) => {
    await storageSet(area, { [PROVIDER_CONFIG_KEY]: config });
  };

  const registerAdapter = (name, adapter) => {
    adapters.set(name, adapter);
    logger?.info?.("Provider adapter registered", { name });
  };

  const invoke = async (role, messages, options = {}) => {
    // Lazy load OpenAI if not yet loaded
    if (!adapters.has("openai")) {
      await lazyLoadOpenAI();
    }

    const config = await loadConfig();
    const roleConfig = config.roles[role] ?? DEFAULT_ROLE_BINDINGS[role];
    const adapter = adapters.get(roleConfig?.provider) ?? adapters.get("mock");

    const normalizedMessages = normalizeMessages(messages);
    let response;
    
    try {
      response = await adapter.invoke({
        role,
        messages: normalizedMessages,
        config: roleConfig,
        options,
      });
    } catch (error) {
      // Graceful fallback to mock
      logger?.warn?.("Provider invocation failed, falling back to mock", {
        role,
        provider: adapter.name,
        error: error.message,
      });
      
      const mockAdapter = adapters.get("mock");
      response = await mockAdapter.invoke({
        role,
        messages: normalizedMessages,
        config: DEFAULT_ROLE_BINDINGS[role],
        options,
      });
      response.fallback = true;
      response.failedProvider = adapter.name;
    }

    const normalized = buildDefaultResponse(response);
    if (!normalized.action) {
      normalized.action = parseInlineAction(normalized.text);
    }

    const tokenEstimate = adapter.estimateTokens?.({ messages: normalizedMessages }) ?? null;

    return {
      role,
      provider: adapter.name,
      model: roleConfig?.model,
      text: normalized.text,
      action: normalized.action,
      raw: normalized.raw,
      tokenEstimate,
      fallback: response.fallback,
    };
  };

  return {
    invoke,
    registerAdapter,
    listProviders: () => [...adapters.keys()],
    getConfig: loadConfig,
    setConfig: saveConfig,
  };
};
