/**
 * Browser automation tool registry.
 * Enhanced version from agent_js/tools.js with better error handling.
 * @implements {ITool}
 */

/**
 * Create tool registry
 * @param {Object} options
 * @param {ILogger} options.logger - Logger instance
 * @returns {ITool}
 */
export class ToolRegistry {
  constructor({ logger = console } = {}) {
    this.logger = logger;
    this.tools = new Map();
    this._registerCore();
  }

  _registerCore() {
    // Navigate to URL
    this.register('navigate', async ({ url }) => {
      if (!url) throw new Error('navigate requires url');
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error('No active tab');
      
      await chrome.tabs.update(tab.id, { url });
      
      // Wait for page load
      await new Promise(resolve => {
        const listener = (tabId, changeInfo) => {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
        
        // Timeout after 30 seconds
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }, 30000);
      });
      
      return { ok: true, url };
    });

    // Extract text from page
    this.register('extractText', async ({ selector = 'body' } = {}) => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab');
      
      // Try content bridge first
      const bridgeResp = await this._sendBridge(tab.id, 'extractText', { selector });
      if (bridgeResp) return bridgeResp.result;
      
      // Fallback to direct injection
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [selector],
        func: (sel) => {
          const el = document.querySelector(sel) || document.body;
          return (el.innerText || '').slice(0, 20000);
        }
      });
      
      return { text: result };
    });

    // Click element
    this.register('click', async ({ selector }) => {
      if (!selector) throw new Error('click requires selector');
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab');
      
      const bridgeResp = await this._sendBridge(tab.id, 'click', { selector });
      if (bridgeResp) return bridgeResp.result;
      
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [selector],
        func: (sel) => {
          const el = document.querySelector(sel);
          if (!el) return { ok: false, error: 'Element not found' };
          el.click();
          return { ok: true };
        }
      });
      
      return result;
    });

    // Type text into element
    this.register('type', async ({ selector, text }) => {
      if (!selector) throw new Error('type requires selector');
      if (text === undefined) throw new Error('type requires text');
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab');
      
      const bridgeResp = await this._sendBridge(tab.id, 'type', { selector, text });
      if (bridgeResp) return bridgeResp.result;
      
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [selector, text],
        func: (sel, txt) => {
          const el = document.querySelector(sel);
          if (!el) return { ok: false, error: 'Element not found' };
          
          if ('value' in el) {
            el.value = txt;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            el.textContent = txt;
          }
          
          return { ok: true };
        }
      });
      
      return result;
    });

    // Scroll page
    this.register('scroll', async ({ y = 400, x = 0 } = {}) => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab');
      
      const bridgeResp = await this._sendBridge(tab.id, 'scroll', { y, x });
      if (bridgeResp) return bridgeResp.result;
      
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [x, y],
        func: (dx, dy) => window.scrollBy(dx, dy)
      });
      
      return { ok: true };
    });

    // Note action (no-op for logging)
    this.register('note', async ({ text }) => {
      this.logger?.info?.('Note action', { text });
      return { ok: true, text };
    });

    // Complete action (signals goal completion)
    this.register('complete', async ({ result } = {}) => {
      this.logger?.info?.('Complete action', { result });
      return { ok: true, result };
    });
  }

  /**
   * Send message to content bridge
   * @private
   */
  async _sendBridge(tabId, tool, args) {
    // Probe bridge with short timeout
    const hasBridge = await new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }, 200);
      
      chrome.tabs.sendMessage(tabId, { kind: 'bridge.ping' }, (resp) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        
        // Check for chrome.runtime.lastError
        if (chrome.runtime?.lastError) {
          resolve(false);
        } else {
          resolve(resp && resp.ok && resp.bridge);
        }
      });
    });
    
    if (!hasBridge) return null;
    
    // Execute tool via bridge
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, { kind: 'toolExec', tool, args }, (resp) => {
        // Check for chrome.runtime.lastError
        if (chrome.runtime?.lastError) {
          resolve(null);
        } else {
          resolve(resp);
        }
      });
    });
  }

  /**
   * Register a new tool
   * @param {string} name - Tool name
   * @param {function} fn - Tool function
   */
  register(name, fn) {
    if (this.tools.has(name)) {
      throw new Error(`Tool already registered: ${name}`);
    }
    this.tools.set(name, fn);
    this.logger?.info?.('Tool registered', { name });
  }

  /**
   * List all registered tools
   * @returns {Array<string>}
   */
  list() {
    return [...this.tools.keys()];
  }

  /**
   * Execute a tool
   * @param {string} name - Tool name
   * @param {Object} args - Tool arguments
   * @returns {Promise<any>}
   */
  async run(name, args) {
    const fn = this.tools.get(name);
    if (!fn) {
      throw new Error(`Unknown tool: ${name}`);
    }
    
    this.logger?.info?.('Tool execution started', { name, args });
    
    try {
      const result = await fn(args || {});
      this.logger?.info?.('Tool execution completed', { name, result });
      return result;
    } catch (error) {
      this.logger?.error?.('Tool execution failed', { 
        name, 
        args, 
        error: error.message 
      });
      throw error;
    }
  }
}

export const createToolRegistry = (options) => new ToolRegistry(options);
