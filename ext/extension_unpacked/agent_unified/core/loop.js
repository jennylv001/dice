/**
 * Unified agent loop with alarm-based scheduling and enhanced planning.
 * Combines alarm reliability from legacy agent with sophisticated planning.
 * @implements {IAgentLoop}
 */

const DEFAULT_CONFIG = {
  idleIntervalMs: 15_000,
  iterationIntervalMs: 5_000,
  failureBackoffMs: 30_000,
  alarmName: "agent_unified.loop.tick",
  maxConsecutiveFailures: 5,
  enableRAG: true,
  ragContextSize: 5,
};

/**
 * Add proportional random jitter to delay to prevent thundering herd
 * Jitter is 10% of delay, capped at 1 second
 */
const jitter = (ms) => ms + Math.random() * Math.min(ms * 0.1, 1000);

/**
 * Build system prompt for planner
 */
const buildPlannerSystemPrompt = (goal, ragContext = []) => {
  let prompt = `You are a strategic planning agent in a Chrome extension. Your role is to break down goals into actionable steps.

Current Goal: "${goal.title}"
Prompt: "${goal.prompt}"

Available actions: navigate, click, type, extractText, scroll, note, complete

You must respond with a JSON object of this form:
{
  "action": {
    "name": "action-name",
    "params": { "param": "value" }
  },
  "reasoning": "explanation of why this action is appropriate"
}`;

  if (ragContext.length > 0) {
    prompt += `\n\nRelevant context from previous experiences:\n`;
    ragContext.forEach((item, idx) => {
      prompt += `${idx + 1}. ${item.doc.text.slice(0, 200)}\n`;
    });
  }

  return prompt;
};

/**
 * Create unified agent loop
 * @param {Object} options
 * @param {IAgentState} options.state - Agent state manager
 * @param {IProvider} options.providers - LLM provider router
 * @param {ITool} options.tools - Tool registry
 * @param {IRAG} options.rag - RAG index (optional)
 * @param {ILogger} options.logger - Logger instance
 * @param {Object} options.config - Configuration overrides
 * @returns {IAgentLoop}
 */
export class AgentLoop {
  constructor({ state, providers, tools, rag, logger, config = {} }) {
    this.state = state;
    this.providers = providers;
    this.tools = tools;
    this.rag = rag;
    this.logger = logger;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.running = false;
    this.alarmListener = this.handleAlarm.bind(this);
  }

  async start() {
    if (this.running) {
      this.logger?.warn?.("Agent loop already running");
      return;
    }

    await this.state.init();
    if (this.rag) {
      await this.rag.load().catch(err => {
        this.logger?.warn?.("Failed to load RAG index", { error: err.message });
      });
    }

    this.running = true;
    chrome.alarms.onAlarm.addListener(this.alarmListener);
    await this.scheduleNext(0);
    
    this.logger?.info?.("Agent loop started", { config: this.config });
  }

  async stop() {
    if (!this.running) {
      return;
    }

    this.running = false;
    chrome.alarms.onAlarm.removeListener(this.alarmListener);
    await chrome.alarms.clear(this.config.alarmName);
    
    this.logger?.info?.("Agent loop stopped");
  }

  async scheduleNext(delayMs) {
    if (!this.running) {
      return;
    }

    const delayInMinutes = Math.max((delayMs ?? this.config.iterationIntervalMs) / 60_000, 0.016);
    await chrome.alarms.clear(this.config.alarmName);
    chrome.alarms.create(this.config.alarmName, {
      delayInMinutes,
    });
  }

  async handleAlarm(alarm) {
    if (!this.running || alarm.name !== this.config.alarmName) {
      return;
    }

    try {
      await this.runCycle();
      await this.scheduleNext(this.config.iterationIntervalMs);
    } catch (error) {
      this.logger?.error?.("Agent loop cycle failed", { 
        message: error.message,
        stack: error.stack 
      });
      await this.scheduleNext(this.config.failureBackoffMs);
    }
  }

  async runCycle() {
    const goal = await this.state.pullNextGoal();
    
    if (!goal) {
      this.logger?.info?.("Agent idle", { reason: "no-goal" });
      await this.scheduleNext(this.config.idleIntervalMs);
      return;
    }

    this.logger?.info?.("Agent executing goal", { 
      goalId: goal.id, 
      title: goal.title,
      runCount: goal.runCount 
    });

    // Get RAG context if enabled
    let ragContext = [];
    if (this.config.enableRAG && this.rag) {
      try {
        ragContext = await this.rag.query(goal.prompt, { 
          k: this.config.ragContextSize 
        });
      } catch (error) {
        this.logger?.warn?.("RAG query failed", { error: error.message });
      }
    }

    // Build planner prompt
    const plannerMessages = [
      { role: "system", content: buildPlannerSystemPrompt(goal, ragContext) },
      { role: "user", content: goal.prompt },
    ];

    // Invoke planner
    let plannerResult;
    try {
      plannerResult = await this.providers.invoke("planner", plannerMessages, {
        expectJson: true,
      });
    } catch (error) {
      await this.state.recordFailure({ 
        goalId: goal.id, 
        error, 
        requeue: true 
      });
      this.logger?.error?.("Planner invocation failed", { 
        goalId: goal.id, 
        error: error.message 
      });
      // Schedule next attempt with backoff and jitter
      await this.scheduleNext(jitter(this.config.failureBackoffMs));
      return;
    }

    // Parse action from planner response
    let action = plannerResult.action;
    if (!action && plannerResult.text) {
      // Try to extract JSON from text
      try {
        const jsonMatch = plannerResult.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          action = parsed.action;
        }
      } catch (error) {
        this.logger?.warn?.("Failed to parse action from text", { 
          text: plannerResult.text.slice(0, 200) 
        });
      }
    }

    if (!action || !action.name) {
      await this.state.recordFailure({
        goalId: goal.id,
        error: new Error("Planner did not return valid action"),
        requeue: true,
      });
      return;
    }

    await this.state.recordPlannerDecision({
      goalId: goal.id,
      action,
      reasoning: plannerResult.raw?.reasoning || plannerResult.text,
      raw: plannerResult.raw,
    });

    // Execute action
    if (action.name === "complete") {
      await this.state.completeGoal({
        goalId: goal.id,
        result: action.params?.result || "Goal completed",
      });
      
      // Add to RAG for future context
      if (this.rag) {
        try {
          await this.rag.add(`Goal: ${goal.title}\nResult: ${action.params?.result || "completed"}`, {
            type: "goal_completion",
            goalId: goal.id,
          });
          await this.rag.persist();
        } catch (error) {
          this.logger?.warn?.("Failed to add to RAG", { error: error.message });
        }
      }
      
      return;
    }

    // Execute tool action
    try {
      const result = await this.tools.run(action.name, action.params || {});
      await this.state.recordActionResult({
        goalId: goal.id,
        action,
        result,
      });

      // Add successful action to RAG
      if (this.rag) {
        try {
          await this.rag.add(
            `Action: ${action.name}\nParams: ${JSON.stringify(action.params)}\nResult: ${JSON.stringify(result).slice(0, 500)}`,
            {
              type: "action_execution",
              actionName: action.name,
              goalId: goal.id,
            }
          );
          await this.rag.persist();
        } catch (error) {
          this.logger?.warn?.("Failed to add action to RAG", { error: error.message });
        }
      }
    } catch (error) {
      await this.state.recordActionResult({
        goalId: goal.id,
        action,
        error: error.message,
      });

      this.logger?.error?.("Action execution failed", {
        goalId: goal.id,
        action: action.name,
        error: error.message,
      });

      // Check if too many consecutive failures
      const snapshot = this.state.getSnapshot();
      if (snapshot.meta.consecutiveFailures >= this.config.maxConsecutiveFailures) {
        await this.state.recordFailure({
          goalId: goal.id,
          error: new Error(`Max consecutive failures (${this.config.maxConsecutiveFailures}) reached`),
          requeue: false,
        });
      }
    }
  }
}

export const createAgentLoop = (options) => new AgentLoop(options);
