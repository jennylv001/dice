/**
 * TypeScript-style JSDoc interface definitions for unified agent core.
 * These interfaces define contracts for dependency injection via constructor.
 */

/**
 * @typedef {Object} ILogger
 * @property {function(string, any=): void} info - Log info message
 * @property {function(string, any=): void} warn - Log warning message
 * @property {function(string, any=): void} error - Log error message
 */

/**
 * @typedef {Object} IProvider
 * @property {function(string, Array<{role: string, content: string}>, Object=): Promise<{text: string, action: Object|null, raw: any}>} invoke - Invoke LLM with role and messages
 * @property {function(): Array<string>} listProviders - List available provider names
 */

/**
 * @typedef {Object} ITool
 * @property {function(string, Object): Promise<any>} run - Execute tool by name with arguments
 * @property {function(): Array<string>} list - List available tool names
 * @property {function(string, function): void} register - Register new tool
 */

/**
 * @typedef {Object} IStorage
 * @property {function(string): Promise<any>} get - Get value by key
 * @property {function(string, any): Promise<void>} set - Set value by key
 * @property {function(string): Promise<void>} remove - Remove value by key
 */

/**
 * @typedef {Object} IRAG
 * @property {function(string, Object=): Promise<Object>} add - Add document to index
 * @property {function(string, Object=): Promise<Array<{doc: Object, score: number}>>} query - Query similar documents
 * @property {function(string, Array<string>): Promise<void>} replaceDomain - Replace domain documents
 * @property {function(): Promise<void>} persist - Persist index to storage
 * @property {function(): Promise<void>} load - Load index from storage
 */

/**
 * @typedef {Object} IAgentState
 * @property {function(): Promise<any>} init - Initialize state from storage
 * @property {function(): Object} getSnapshot - Get current state snapshot
 * @property {function(string|Object): Promise<Object>} enqueueGoal - Add goal to queue
 * @property {function(): Promise<Object|null>} pullNextGoal - Get next goal to execute
 * @property {function(Object): Promise<void>} recordPlannerDecision - Record planner decision
 * @property {function(Object): Promise<void>} recordFailure - Record failure
 * @property {function(Object): Promise<void>} completeGoal - Mark goal as complete
 */

/**
 * @typedef {Object} IAgentLoop
 * @property {function(): Promise<void>} start - Start the agent loop
 * @property {function(): Promise<void>} stop - Stop the agent loop
 * @property {function(): Promise<void>} runCycle - Run a single cycle
 */

export {
  // Type definitions only - no runtime exports needed
};
