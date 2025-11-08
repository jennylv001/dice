const runtime = typeof chrome !== "undefined" ? chrome.runtime : undefined;

const sendMessage = (payload) =>
  new Promise((resolve, reject) => {
    if (!runtime?.sendMessage) {
      reject(new Error("Agent messaging unavailable"));
      return;
    }

    try {
      runtime.sendMessage(payload, (response) => {
  const err = runtime?.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  });

const listeners = new Set();
let lastSnapshot = null;

const dispatchStateEvent = (reason = "push") => {
  if (!lastSnapshot) {
    return;
  }

  const detail = { snapshot: lastSnapshot, reason };

  listeners.forEach((listener) => {
    try {
      listener(detail.snapshot, detail.reason);
    } catch (error) {
      console.warn("[agent-bridge] listener error", error);
    }
  });

  window.dispatchEvent(new CustomEvent("agent.state", { detail }));
};

const updateFromBackground = ({ snapshot, reason }) => {
  if (!snapshot) {
    return;
  }
  lastSnapshot = snapshot;
  dispatchStateEvent(reason ?? "push");
};

if (runtime?.onMessage) {
  runtime.onMessage.addListener((message) => {
    if (message?.type === "agent.stateUpdate") {
      updateFromBackground(message.payload ?? {});
    }
  });
}

const queueGoal = async (payload) => {
  const response = await sendMessage({ type: "agent.queueGoal", payload });
  if (!response?.ok) {
    throw new Error(response?.error ?? "Failed to enqueue goal");
  }
  await refresh("queue-goal");
  return response.goal;
};

const getState = async () => {
  const response = await sendMessage({ type: "agent.getState" });
  if (!response?.ok) {
    throw new Error(response?.error ?? "Failed to fetch agent state");
  }
  lastSnapshot = response.snapshot;
  dispatchStateEvent("pull");
  return lastSnapshot;
};

const refresh = async (reason) => {
  await getState();
  dispatchStateEvent(reason);
};

const subscribe = (listener, { emitCurrent = true } = {}) => {
  listeners.add(listener);
  if (emitCurrent && lastSnapshot) {
    try {
      listener(lastSnapshot, "immediate");
    } catch (error) {
      console.warn("[agent-bridge] listener error", error);
    }
  }

  return () => listeners.delete(listener);
};

const agentBridge = {
  queueGoal,
  getState,
  refresh,
  subscribe,
  getSnapshot: () => lastSnapshot,
};

if (!window.agentBridge) {
  window.agentBridge = agentBridge;
  window.dispatchEvent(new CustomEvent("agent.bridge-ready", { detail: agentBridge }));
}

export default agentBridge;
