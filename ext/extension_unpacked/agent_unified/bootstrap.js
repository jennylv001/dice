/**
 * Unified Agent Bootstrap
 * Single entry point combining best of both agent architectures.
 * 
 * Architecture: Hexagonal/Ports & Adapters
 * - Core: State management and execution loop
 * - Adapters: Providers (LLM), Tools (browser automation), RAG (context)
 */

import { createAgentState } from "./core/state.js";
import { AgentLoop } from "./core/loop.js";
import { createProviderRouter } from "./adapters/providerRouter.js";
import { createToolRegistry } from "./adapters/toolRegistry.js";
import { createRAGIndex } from "./adapters/ragIndex.js";

let bootstrapPromise;
let listenersRegistered = false;

/**
 * Simple logger implementation
 */
const createLogger = () => ({
  info: (msg, data) => console.log(`[agent_unified] ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`[agent_unified] ${msg}`, data || ''),
  error: (msg, data) => console.error(`[agent_unified] ${msg}`, data || ''),
});

/**
 * Register chrome.runtime message listeners
 */
const registerRuntimeListeners = ({ state, tools, providers, rag, logger }) => {
  if (listenersRegistered) {
    return;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== "object") {
      return false;
    }

    // Unified message API: agent.*
    if (message.type === "agent.queueGoal" || message.type === "agent.enqueueGoal") {
      state
        .enqueueGoal(message.payload)
        .then((goal) => {
          sendResponse({ ok: true, goal });
        })
        .catch((error) => {
          logger.error("Failed to enqueue goal", { error: error.message });
          sendResponse({ ok: false, error: error.message });
        });
      return true;
    }

    if (message.type === "agent.getState" || message.type === "agent.snapshot") {
      Promise.resolve(state.getSnapshot())
        .then((snapshot) => sendResponse({ ok: true, snapshot }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message.type === "agent.listTools") {
      try {
        sendResponse({ ok: true, tools: tools.list() });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
      return true;
    }

    if (message.type === "agent.listProviders") {
      try {
        sendResponse({ ok: true, providers: providers.listProviders() });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
      return true;
    }

    if (message.type === "agent.getRAGStats") {
      try {
        sendResponse({ ok: true, stats: rag.getStats() });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
      return true;
    }

    // Legacy compatibility: jsAgent.* messages
    if (message.type === "jsAgent.enqueueGoal") {
      state
        .enqueueGoal(message.payload)
        .then((goal) => sendResponse({ ok: true, goal }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message.type === "jsAgent.snapshot") {
      sendResponse({ ok: true, snapshot: state.getSnapshot() });
      return true;
    }

    if (message.type === "jsAgent.listTools") {
      sendResponse({ ok: true, tools: tools.list() });
      return true;
    }

    return false;
  });

  listenersRegistered = true;
  logger.info("Runtime listeners registered");
};

/**
 * Bootstrap unified agent
 * @returns {Promise<Object>} Agent context
 */
const bootstrapAgent = async () => {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    const logger = createLogger();
    logger.info("Bootstrapping unified agent...");

    // Create core state
    const state = createAgentState({ logger });
    await state.init();

    // Create adapters
    const providers = createProviderRouter({ logger });
    const tools = createToolRegistry({ logger });
    const rag = createRAGIndex({ logger });

    // Load RAG index from storage
    await rag.load().catch(err => {
      logger.warn("Failed to load RAG index", { error: err.message });
    });

    // Create and start agent loop
    const loop = new AgentLoop({
      state,
      providers,
      tools,
      rag,
      logger,
    });

    await loop.start();

    // Register message listeners
    registerRuntimeListeners({ state, tools, providers, rag, logger });

    logger.info("Agent bootstrapped successfully", {
      providers: providers.listProviders(),
      tools: tools.list(),
      ragDocs: rag.getStats().documentCount,
    });

    return {
      logger,
      state,
      providers,
      tools,
      rag,
      loop,
    };
  })();

  return bootstrapPromise;
};

/**
 * Auto-bootstrap if in Chrome extension context
 */
if (typeof chrome !== "undefined" && chrome.runtime?.id) {
  bootstrapAgent().catch((error) => {
    console.error("[agent_unified] Failed to bootstrap agent", error);
  });
}

export { bootstrapAgent };
