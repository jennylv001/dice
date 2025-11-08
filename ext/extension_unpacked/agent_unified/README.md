# Unified Agent Core

A single, cohesive autonomous agent system combining the best features from both previous architectures (`/agent/` and `/agent_js/`).

## Architecture

### Hexagonal / Ports & Adapters Pattern

```
┌─────────────────────────────────────┐
│     Agent Core (state + loop)      │
├─────────────────────────────────────┤
│  Ports: IProvider, ITool, IStorage │
└─────────────────────────────────────┘
           ↓              ↓         ↓
    ┌────────┐    ┌────────┐  ┌──────┐
    │Provider│    │  Tool  │  │ RAG  │
    │Adapter │    │Adapter │  │Index │
    └────────┘    └────────┘  └──────┘
```

### Core Components

#### `/core/`
- **state.js** - Persistent state management using chrome.storage
  - Goal queue management
  - Execution history
  - Message tracking
  - Automatic persistence and broadcasting
  
- **loop.js** - Alarm-based execution loop
  - Chrome alarms for reliable scheduling
  - Failure handling with exponential backoff
  - RAG-enhanced planning
  - Graceful degradation
  
- **interfaces.js** - TypeScript-style JSDoc type definitions
  - Contract definitions for dependency injection
  - Documentation via types

### Adapters

#### `/adapters/`
- **providerRouter.js** - Multi-LLM provider management
  - Support for OpenAI, Anthropic, and other providers
  - Role-based model selection (planner, navigator)
  - Graceful fallback to mock provider
  - Configuration persistence
  
- **toolRegistry.js** - Browser automation tools
  - Navigate, click, type, extractText, scroll
  - Content bridge integration for performance
  - Fallback to chrome.scripting
  - Error handling and logging
  
- **ragIndex.js** - Retrieval-Augmented Generation
  - Vector-based semantic search
  - chrome.storage persistence
  - Simple embedding (extensible to LLM embeddings)
  - Domain-based document management

## Features

### ✅ Unified Message API

All agent interactions use the `agent.*` namespace:

```javascript
// Queue a goal
chrome.runtime.sendMessage({
  type: "agent.queueGoal",
  payload: "Find pricing for Acme SaaS"
}, (response) => {
  console.log("Goal queued:", response.goal);
});

// Get agent state
chrome.runtime.sendMessage({
  type: "agent.getState"
}, (response) => {
  console.log("State:", response.snapshot);
});

// List available tools
chrome.runtime.sendMessage({
  type: "agent.listTools"
}, (response) => {
  console.log("Tools:", response.tools);
});

// List available providers
chrome.runtime.sendMessage({
  type: "agent.listProviders"
}, (response) => {
  console.log("Providers:", response.providers);
});

// Get RAG statistics
chrome.runtime.sendMessage({
  type: "agent.getRAGStats"
}, (response) => {
  console.log("RAG stats:", response.stats);
});
```

### ✅ Persistent State

All state is automatically persisted to `chrome.storage.local`:
- Goal queue survives extension restarts
- Execution history maintained
- RAG index preserved across sessions
- Configuration settings persisted

### ✅ Multi-Provider LLM Support

Configure different models for different roles:

```javascript
{
  roles: {
    planner: {
      provider: "openai",
      model: "gpt-4",
      params: { temperature: 0.2 }
    },
    navigator: {
      provider: "openai", 
      model: "gpt-4o-mini",
      params: { temperature: 0.4 }
    }
  }
}
```

### ✅ Rich Browser Automation

Built-in tools:
- `navigate` - Navigate to URL with load detection
- `click` - Click element by selector
- `type` - Type text into input fields
- `extractText` - Extract text from page
- `scroll` - Scroll page by pixels
- `note` - Log information
- `complete` - Mark goal as complete

### ✅ RAG-Enhanced Context

The planner receives relevant historical context:
- Previous successful actions
- Completed goals
- Domain-specific knowledge
- Semantic similarity search

### ✅ Alarm-Based Scheduling

Reliable execution using Chrome alarms:
- Survives service worker lifecycle
- Configurable intervals
- Exponential backoff on failures
- Idle detection

## Design Principles

### 1. Simplicity Through Abstraction
- Interfaces hide complexity
- Single responsibility per adapter
- Dependency injection via constructor

### 2. Progressive Enhancement
- Core works without RAG (graceful degradation)
- Providers fail gracefully to mock
- Tools degrade to chrome.scripting

### 3. Observable State
- State changes emit events
- UI can subscribe to updates
- No polling required

### 4. Fail-Safe Defaults
- Empty RAG index = no context
- Missing provider = use mock
- Tool failure = log + continue

## Migration from Legacy APIs

The unified agent maintains backward compatibility:

### Old API → New API
```javascript
// Old: agent.queueGoal
agent.queueGoal(payload) → agent.queueGoal(payload)

// Old: agent.getState  
agent.getState() → agent.getState()

// Old: jsAgent.enqueueGoal
jsAgent.enqueueGoal(payload) → agent.queueGoal(payload)

// Old: jsAgent.snapshot
jsAgent.snapshot() → agent.getState()

// Old: jsAgent.listTools
jsAgent.listTools() → agent.listTools()
```

Both old and new APIs are supported during the migration period.

## Usage

### Bootstrap

The agent auto-bootstraps when loaded in a Chrome extension context:

```javascript
import { bootstrapAgent } from "./agent_unified/bootstrap.js";

const agent = await bootstrapAgent();
console.log("Agent ready:", agent);
```

### Configuration

Configure providers via chrome.storage:

```javascript
const config = {
  roles: {
    planner: {
      provider: "openai",
      model: "gpt-4",
      params: { temperature: 0.2 }
    }
  }
};

await chrome.storage.local.set({
  "agent_unified:providers:config:v1": config
});
```

### Custom Tools

Register custom tools:

```javascript
const { tools } = await bootstrapAgent();

tools.register("customTool", async ({ param1 }) => {
  // Custom logic
  return { result: "success" };
});
```

### RAG Management

Add documents to RAG:

```javascript
const { rag } = await bootstrapAgent();

await rag.add("Important context about X", {
  type: "knowledge",
  domain: "myapp"
});

await rag.persist();
```

## Performance Considerations

- **State Persistence**: Debounced to reduce storage writes
- **RAG Embedding**: Cached to avoid redundant computations
- **Tool Execution**: Content bridge preferred over injection
- **Provider Fallback**: Mock adapter prevents loop stalling

## Security

- All chrome.storage keys namespaced with `agent_unified:`
- No external network requests except configured LLM providers
- Content scripts use message-based communication
- Tool execution sandboxed in content context

## Troubleshooting

### Agent not starting
- Check console for bootstrap errors
- Verify chrome.alarms permission in manifest
- Ensure chrome.storage is available

### Goals not executing
- Check alarm is scheduled: `chrome.alarms.getAll()`
- Verify provider configuration
- Check for consecutive failures in state

### RAG not working
- Verify documents are added: `agent.getRAGStats()`
- Check persistence: look for errors in console
- Ensure storage quota not exceeded

## Future Enhancements

- [ ] LLM-based embeddings (OpenAI, Cohere)
- [ ] Vision support for screenshot analysis
- [ ] Multi-tab coordination
- [ ] Workflow templates
- [ ] Performance telemetry
- [ ] A/B testing for planner prompts
