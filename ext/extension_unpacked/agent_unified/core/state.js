/**
 * Unified agent state with chrome.storage persistence.
 * Combines features from legacy agent (storage, structure) and modern agent (simplicity).
 * @implements {IAgentState}
 */

const STATE_STORAGE_KEY = "agent_unified:state:v1";
const HISTORY_LIMIT = 50;

/**
 * @typedef {Object} Goal
 * @property {string} id - Unique goal identifier
 * @property {string} status - Goal status: queued, active, completed, failed
 * @property {string} title - Short goal title
 * @property {string} prompt - Full goal prompt
 * @property {Array<Object>} steps - Execution steps
 * @property {Object} metadata - Additional metadata
 * @property {string} channel - Channel source (manual, alarm, etc)
 * @property {Object} context - Goal-specific context
 * @property {string|null} expectedOutcome - Expected outcome description
 * @property {number} createdAt - Creation timestamp
 * @property {number} updatedAt - Last update timestamp
 * @property {number} runCount - Number of execution attempts
 * @property {number} dueAt - When goal should execute
 */

/**
 * Resolves chrome.storage area by name
 */
function resolveStorageArea(area = "local") {
  if (typeof chrome === "undefined" || !chrome.storage) {
    throw new Error("[agent_unified/state] chrome.storage is not available");
  }

  const storageArea = chrome.storage[area];
  if (!storageArea) {
    throw new Error(`[agent_unified/state] Unknown storage area: ${area}`);
  }

  return storageArea;
}

/**
 * Promisified chrome.storage operations
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
 * Generate UUID (fallback for environments without crypto.randomUUID)
 */
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback UUID v4 implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

/**
 * Clone helper
 */
const clone = (value) => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

/**
 * Create base state structure
 */
const createBaseState = () => ({
  version: 1,
  currentGoal: null,
  goalQueue: [],
  history: [],
  messages: [],
  meta: {
    consecutiveFailures: 0,
    totalRuns: 0,
    completedGoals: 0,
    lastRunAt: null,
    lastFailure: null,
  },
});

/**
 * Normalize goal input to standard format
 */
const normalizeGoalInput = (payload) => {
  if (!payload) {
    throw new Error("Goal payload is required");
  }

  if (typeof payload === "string") {
    const text = payload.trim();
    if (!text) {
      throw new Error("Goal string payload cannot be empty");
    }

    return {
      title: text,
      prompt: text,
      metadata: {},
      channel: "manual",
    };
  }

  if (typeof payload !== "object") {
    throw new Error("Goal payload must be a string or object");
  }

  const title = payload.title ?? payload.prompt ?? payload.text;
  if (!title || !String(title).trim()) {
    throw new Error("Goal payload must include a title, prompt, or text field");
  }

  return {
    title: String(payload.title ?? title).trim(),
    prompt: String(payload.prompt ?? title).trim(),
    metadata: payload.metadata ?? {},
    channel: payload.channel ?? "manual",
    context: payload.context ?? {},
    expectedOutcome: payload.expectedOutcome ?? payload.outcome ?? null,
  };
};

/**
 * Hydrate state from storage
 */
const hydrateState = (raw) => {
  if (!raw || typeof raw !== "object") {
    return createBaseState();
  }

  const base = createBaseState();
  return {
    ...base,
    ...raw,
    meta: {
      ...base.meta,
      ...(raw.meta ?? {}),
    },
    goalQueue: Array.isArray(raw.goalQueue) ? raw.goalQueue : [],
    history: Array.isArray(raw.history) ? raw.history.slice(-HISTORY_LIMIT) : [],
    messages: Array.isArray(raw.messages) ? raw.messages.slice(-100) : [],
  };
};

/**
 * Create unified agent state
 * @param {Object} options
 * @param {string} options.storageArea - chrome.storage area to use
 * @param {ILogger} options.logger - Logger instance
 * @returns {IAgentState}
 */
export const createAgentState = ({ storageArea = "local", logger } = {}) => {
  const area = resolveStorageArea(storageArea);
  let internalState = createBaseState();
  let initialized = false;

  const persist = async () => {
    await storageSet(area, { [STATE_STORAGE_KEY]: internalState });
  };

  const broadcast = (reason) => {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      return;
    }

    try {
      const snapshot = clone(internalState);
      // Note: chrome.runtime.sendMessage returns undefined in MV3 when using callbacks
      // We use fire-and-forget pattern here since state updates are not critical
      chrome.runtime.sendMessage({
        type: "agent.stateUpdate",
        payload: {
          reason,
          snapshot,
        },
      });
    } catch (error) {
      // Silently ignore broadcast errors in non-extension contexts
      // This is expected when no listeners are registered
    }
  };

  const init = async () => {
    if (initialized) {
      return clone(internalState);
    }

    const stored = await storageGet(area, STATE_STORAGE_KEY);
    internalState = hydrateState(stored);
    initialized = true;
    logger?.info?.("Agent state initialized", {
      goalQueue: internalState.goalQueue.length,
      currentGoal: internalState.currentGoal?.id,
    });
    return clone(internalState);
  };

  const getSnapshot = () => clone(internalState);

  const enqueueGoal = async (payload) => {
    await init();
    const normalized = normalizeGoalInput(payload);
    const goal = {
      id: generateUUID(),
      status: "queued",
      steps: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      runCount: 0,
      dueAt: normalized.dueAt ?? Date.now(),
      ...normalized,
    };

    internalState.goalQueue.push(goal);
    await persist();
    logger?.info?.("Goal enqueued", { goalId: goal.id, title: goal.title });
    broadcast("goal-enqueued");
    return goal;
  };

  const pullNextGoal = async () => {
    await init();
    
    if (internalState.currentGoal) {
      return internalState.currentGoal;
    }

    // Find next due goal
    const now = Date.now();
    const dueGoals = internalState.goalQueue.filter(
      (g) => g.status === "queued" && g.dueAt <= now
    );

    if (dueGoals.length === 0) {
      return null;
    }

    // Sort by dueAt ascending
    dueGoals.sort((a, b) => a.dueAt - b.dueAt);
    const goal = dueGoals[0];

    goal.status = "active";
    goal.updatedAt = Date.now();
    goal.runCount += 1;
    internalState.currentGoal = goal;

    await persist();
    broadcast("goal-started");
    return goal;
  };

  const recordPlannerDecision = async ({ goalId, action, reasoning, raw }) => {
    await init();
    
    const goal = internalState.currentGoal;
    if (!goal || goal.id !== goalId) {
      logger?.warn?.("Cannot record decision: goal not current", { goalId, currentGoalId: goal?.id });
      return;
    }

    goal.steps.push({
      type: "planner",
      action,
      reasoning,
      raw,
      timestamp: Date.now(),
    });
    goal.updatedAt = Date.now();

    await persist();
    broadcast("planner-decision");
  };

  const recordActionResult = async ({ goalId, action, result, error }) => {
    await init();
    
    const goal = internalState.currentGoal;
    if (!goal || goal.id !== goalId) {
      logger?.warn?.("Cannot record action result: goal not current", { goalId, currentGoalId: goal?.id });
      return;
    }

    goal.steps.push({
      type: "action",
      action,
      result,
      error,
      timestamp: Date.now(),
    });
    goal.updatedAt = Date.now();

    await persist();
    broadcast("action-result");
  };

  const recordFailure = async ({ goalId, error, requeue = false }) => {
    await init();
    
    const goal = internalState.currentGoal;
    if (!goal || goal.id !== goalId) {
      logger?.warn?.("Cannot record failure: goal not current", { goalId });
      return;
    }

    internalState.meta.consecutiveFailures += 1;
    internalState.meta.lastFailure = {
      goalId: goal.id,
      error: error.message || String(error),
      timestamp: Date.now(),
    };

    if (requeue) {
      goal.status = "queued";
      goal.dueAt = Date.now() + 60_000; // Retry in 1 minute
      internalState.currentGoal = null;
    } else {
      goal.status = "failed";
      internalState.goalQueue = internalState.goalQueue.filter((g) => g.id !== goal.id);
      internalState.history.push(goal);
      internalState.currentGoal = null;
    }

    await persist();
    broadcast("goal-failed");
  };

  const completeGoal = async ({ goalId, result }) => {
    await init();
    
    const goal = internalState.currentGoal;
    if (!goal || goal.id !== goalId) {
      logger?.warn?.("Cannot complete: goal not current", { goalId });
      return;
    }

    goal.status = "completed";
    goal.updatedAt = Date.now();
    goal.result = result;

    internalState.meta.consecutiveFailures = 0;
    internalState.meta.completedGoals += 1;
    internalState.goalQueue = internalState.goalQueue.filter((g) => g.id !== goal.id);
    internalState.history.push(goal);
    internalState.currentGoal = null;

    await persist();
    logger?.info?.("Goal completed", { goalId: goal.id, title: goal.title });
    broadcast("goal-completed");
  };

  const appendMessage = async (message) => {
    await init();
    internalState.messages.push({
      ...message,
      timestamp: Date.now(),
    });
    
    // Keep only recent messages
    if (internalState.messages.length > 100) {
      internalState.messages = internalState.messages.slice(-100);
    }
    
    await persist();
  };

  return {
    init,
    getSnapshot,
    enqueueGoal,
    pullNextGoal,
    recordPlannerDecision,
    recordActionResult,
    recordFailure,
    completeGoal,
    appendMessage,
  };
};
