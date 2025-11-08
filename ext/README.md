# Copilot — Enterprise Browser Automation Extension

Professional AI-powered browser automation assistant with enterprise-grade UI/UX, WCAG AA accessibility, and intelligent task completion.

## Overview

Copilot transforms browser interactions through autonomous agents that understand context, learn from patterns, and execute complex workflows with minimal human intervention. Built with calm, professional aesthetics and mathematical design precision.

### Key Features

- **Unified Agent System**: Single, cohesive autonomous agent combining alarm-based scheduling with RAG-enhanced planning
- **Multi-Provider LLM Support**: OpenAI, Anthropic, DeepSeek, Gemini, Grok, Ollama, Azure OpenAI, OpenRouter, Groq, Cerebras, Llama
- **RAG-Enhanced Context**: Vector-based semantic search with chrome.storage persistence for relevant historical context
- **Persistent State Management**: Goals, execution history, and RAG index survive extension restarts
- **Rich Browser Automation**: 7 built-in tools (navigate, click, type, extractText, scroll, note, complete)
- **Content Bridge**: Secure DOM manipulation via message-based tool execution
- **Enterprise UI/UX**: WCAG AA compliant, calm color palette, mathematical spacing system
- **Firewall Protection**: Allow/deny list for domain-level access control
- **Voice Input**: Speech-to-text with Gemini model integration
- **Task Replay**: Historical task recording and playback (experimental)

## Design Philosophy

### Systematic Foundation
- 8px base unit grid, fibonacci type scale
- 40-60% intentional whitespace ratio
- Zero cumulative layout shift
- 4.5:1 text contrast (WCAG AA), 44px touch targets

### Visual Hierarchy
- Scale → Weight → Color dominance pyramid
- ≤3 attention points per viewport
- F-pattern content, Z-pattern CTAs
- Progressive disclosure for information density

### Premium Polish
- Layered shadows (4 elevation levels)
- Organic easing curves (spring physics)
- Directional lighting (315° angle)
- Hover scale (1.02x), glow effects (8px blur)
- GPU-optimized animations (transform/opacity only)

## Quick Start

### Installation

1. **Clone Repository**
   ```bash
   git clone <repository-url>
   cd nanobrowser
   ```

2. **Load in Chrome**
   - Navigate to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `extension_unpacked/` directory

3. **Configure API Keys**
   - Click extension icon in toolbar
   - Open Settings → Models → LLM Providers
   - Add your provider (e.g., OpenAI with API key)
   - Save configuration

4. **Select Agent Models**
   - Settings → Models → Model Selection
   - Choose Planner model (strategic reasoning)
   - Choose Navigator model (action execution)
   - Optionally configure Speech-to-Text model

### Basic Usage

1. **Start a Task**
   - Open side panel (click extension icon)
   - Type your goal: "Find pricing for Acme SaaS product"
   - Press Send or Enter

2. **Monitor Execution**
   - Watch agent reasoning in conversation view
   - See tool executions (navigate, extract, click, type)
   - Interrupt with Stop button if needed

3. **Review Results**
   - Agent will present findings in chat
   - Use "Cache" action for persistent memory
   - Access history via load history button

## Configuration

### General Settings

- **Max Steps**: Limit execution steps per task (default: 100)
- **Max Actions per Step**: Action limit per planning cycle (default: 5)
- **Failure Tolerance**: Consecutive failures before stopping (default: 3)
- **Enable Vision**: Use LLM vision for screenshot analysis (higher token cost)
- **Display Highlights**: Show visual highlights on interactive elements
- **Planning Interval**: Replanning frequency (every N steps, default: 3)
- **Page Load Wait**: Minimum wait after navigation (250-5000ms)

### Firewall

- **Allow List**: Permitted domains (empty = allow all not denied)
- **Deny List**: Blocked domains (takes priority over allow list)
- **Behavior**: Deny list blocks access; allow list restricts to specified domains

### Model Parameters

- **Temperature**: Creativity vs determinism (0.0-2.0)
  - Planner: 0.7 (creative strategy)
  - Navigator: 0.3 (precise actions)
- **Top P**: Nucleus sampling threshold (0.0-1.0)
  - Planner: 0.9 (broad exploration)
  - Navigator: 0.85 (focused selection)

## Architecture

### Unified Agent System

The extension uses a **Hexagonal/Ports & Adapters** architecture for clean separation of concerns:

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

**Execution Flow:**

```
User Goal → State Manager (enqueue to chrome.storage)
          ↓
          Alarm-based Loop (reliable scheduling)
          ↓
          RAG Query (retrieve relevant context)
          ↓
          Provider Router (planner LLM)
          ↓
          Tool Registry (navigate, click, type, extract, scroll)
          ↓
          Content Bridge (secure DOM manipulation)
          ↓
          State Update (record result, persist)
          ↓
          Next Iteration or Complete
```

### Component Structure

- **Background Service Worker**: Unified agent bootstrap, alarm-based scheduling
- **Content Script**: DOM tool execution, page event monitoring
- **Side Panel**: Chat interface, history management
- **Options Page**: Settings, provider configuration, firewall rules

### File Organization

```
/extension_unpacked/
  agent_unified/       # Unified agent system (v0.2.0+)
    core/              # Core state & loop
      interfaces.js    # TypeScript-style type definitions
      state.js         # Persistent state (chrome.storage)
      loop.js          # Alarm-based scheduling
    adapters/          # External integrations
      providerRouter.js # Multi-LLM provider routing
      toolRegistry.js   # Browser automation tools
      ragIndex.js       # RAG with persistence
    bootstrap.js       # Single entry point
    README.md          # Architecture documentation
  
  agent/               # Legacy agent (deprecated, will be removed)
  agent_js/            # Legacy JS agent (deprecated, will be removed)
  content/             # Content script bundle
  side-panel/          # React-based chat UI (precompiled)
  options/             # React-based settings UI (precompiled)
  design-system/       # Token definitions, component patterns
```

## Development

### Design System

All UI components follow the [Design System](./DESIGN_SYSTEM.md) specification:

- **Tokens**: `design-system.json` (W3C format)
- **Styles**: `design-system.css` (CSS custom properties)
- **Components**: BEM naming, state variants, WCAG AA compliance
- **Icons**: SVG source in `icon-*.svg`, generate PNG via build script

### Adding New Components

1. Define tokens in `design-system.json`
2. Create CSS component in `design-system.css`
3. Document pattern in `DESIGN_SYSTEM.md`
4. Verify WCAG AA contrast ratios
5. Test keyboard navigation and screen reader support

### Loading (No Build Step Required)

This extension loads directly from the `extension_unpacked/` directory.

Steps:
1. Open `chrome://extensions` and enable Developer Mode.
2. Click "Load unpacked" and select the `extension_unpacked/` folder.
3. Chrome will register the MV3 service worker `background.iife.js` which imports the unified agent from `agent_unified/`.

If Chrome reports a service worker registration failure:
* Ensure the folder you loaded is `extension_unpacked/` and contains `background.iife.js`
* Verify the `agent_unified/` directory exists
* Check the service worker console for specific missing file errors

### Testing Unified Agent

```javascript
// In service worker console (chrome://extensions → Service Worker: Inspect views)

// Queue a goal
chrome.runtime.sendMessage({
  type: "agent.queueGoal",
  payload: "Navigate to example.com and extract page title"
}, console.log);

// Get agent state
chrome.runtime.sendMessage({
  type: "agent.getState"
}, console.log);

// List available tools
chrome.runtime.sendMessage({
  type: "agent.listTools"
}, console.log);

// List available providers
chrome.runtime.sendMessage({
  type: "agent.listProviders"
}, console.log);

// Get RAG statistics
chrome.runtime.sendMessage({
  type: "agent.getRAGStats"
}, console.log);
```

### Migration from Legacy APIs

If you're using the old agent APIs, they're still supported for backward compatibility:

| Legacy API | Unified API | Notes |
|------------|-------------|-------|
| `agent.queueGoal` | `agent.queueGoal` | No change |
| `agent.getState` | `agent.getState` | No change |
| `jsAgent.enqueueGoal` | `agent.queueGoal` | Use new unified API |
| `jsAgent.snapshot` | `agent.getState` | Use new unified API |
| `jsAgent.listTools` | `agent.listTools` | Use new unified API |

The legacy `agent/` and `agent_js/` directories are deprecated and will be removed in v0.3.0.

## Accessibility

- **Keyboard Navigation**: All interactive elements accessible via Tab/Enter/Space
- **Screen Reader Support**: Semantic HTML, ARIA labels, live regions
- **Focus Indicators**: 2px blue ring with 0.1 opacity background
- **Reduced Motion**: Respects `prefers-reduced-motion` media query
- **Touch Targets**: Minimum 44×44px (WCAG 2.5.5 Level AAA)
- **Color Contrast**: Minimum 4.5:1 for text, 3:1 for UI components

## Performance

- **Animation**: GPU-accelerated (transform/opacity only)
- **Bundle Size**: <200KB gzipped per view
- **First Paint**: <1.5s
- **Cumulative Layout Shift**: <0.1
- **Time to Interactive**: <3.5s

## Security

- **Firewall**: Host-based allow/deny lists
- **Selector Sanitization**: Length caps, character filtering
- **Content Bridge**: Origin validation, message type checking
- **API Key Storage**: Chrome storage (local), never transmitted to third parties
- **Permission Model**: Minimal required permissions (storage, scripting, tabs, navigation)

## Troubleshooting

### Agent Not Responding

1. Check API keys in Settings → Models → LLM Providers
2. Verify provider base URL and model names
3. Inspect service worker console for errors
4. Confirm firewall not blocking target domains

### Vision Not Working

- Ensure model supports vision (OpenAI gpt-4o, Gemini 2.0+, Claude 3+)
- Enable "Vision" toggle in General Settings
- Check provider billing/quota limits

### Tools Failing

- Open content script console on active tab
- Test content bridge: `chrome.tabs.sendMessage(tabId, {kind: "bridge.ping"}, console.log)`
- Verify selectors are valid CSS (no XPath)
- Check element visibility and interaction state

### Service Worker / Loading Issues

- Confirm you loaded the repository root, not a partially generated folder.
- Check `background.iife.js` console for import errors (missing runtime folder).
- Verify `manifest.json` declares the correct service worker filename.
- If icons fail: ensure `icon-32.png` and `icon-128.png` exist at root.

## Roadmap

- [ ] Dark mode theme variant
- [ ] Persistent RAG index (IndexedDB storage)
- [ ] State persistence across service worker restarts
- [ ] Multi-tab coordination
- [ ] Advanced planning cadence (backoff, adaptive intervals)
- [ ] Firewall enforcement in content bridge
- [ ] Automated unit tests (Node.js + mocks)
- [ ] Performance profiling dashboard

## License

Proprietary - All rights reserved

## Credits

- Design System: Inspired by Material Design 3, Fluent 2, Carbon
- Icons: Custom "C" monogram with chevron accent
- Typography: System font stack for platform consistency
- Color Palette: Calm blue-gray enterprise spectrum

---

**Version**: 0.2.0  
**Last Updated**: October 2025  
**Status**: Production-ready enterprise automation extension
