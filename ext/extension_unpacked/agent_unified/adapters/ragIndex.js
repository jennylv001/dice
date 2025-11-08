/**
 * RAG (Retrieval-Augmented Generation) index with chrome.storage persistence.
 * Enhanced from agent_js/ragIndex.js with persistent storage.
 * @implements {IRAG}
 */

const RAG_STORAGE_KEY = "agent_unified:rag:index:v1";

/**
 * Resolves chrome.storage area
 */
function resolveStorageArea(area = "local") {
  if (typeof chrome === "undefined" || !chrome.storage) {
    throw new Error("[agent_unified/ragIndex] chrome.storage not available");
  }

  const storageArea = chrome.storage[area];
  if (!storageArea) {
    throw new Error(`[agent_unified/ragIndex] Unknown storage area: ${area}`);
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
 * Cosine similarity between two vectors
 */
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

/**
 * Simple text embedding (TF-IDF style)
 * In production, this would use an LLM embedding API
 */
function simpleEmbed(text) {
  // Normalize text
  const normalized = text.toLowerCase().replace(/[^\w\s]/g, ' ');
  const words = normalized.split(/\s+/).filter(w => w.length > 2);
  
  // Create simple vocabulary-based embedding
  const vocab = new Set(words);
  const embedding = new Array(128).fill(0);
  
  words.forEach((word, idx) => {
    const hash = word.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);
    
    const index = Math.abs(hash) % embedding.length;
    embedding[index] += 1.0 / (idx + 1); // Position-weighted
  });
  
  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  return embedding.map(v => v / (magnitude + 1e-9));
}

/**
 * Generate UUID (fallback for environments without crypto.randomUUID)
 */
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback UUID v4 implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * RAG Index with persistence
 * @implements {IRAG}
 */
export class RAGIndex {
  constructor({ llmClient, storageArea = "local", maxDocuments = 500, logger = console } = {}) {
    this.llm = llmClient;
    this.storageArea = resolveStorageArea(storageArea);
    this.maxDocuments = maxDocuments;
    this.logger = logger;
    this.docs = []; // { id, text, embedding, meta, timestamp }
    this.embedCache = new Map(); // Text -> embedding cache
  }

  /**
   * Load index from storage
   */
  async load() {
    try {
      const stored = await storageGet(this.storageArea, RAG_STORAGE_KEY);
      if (stored && Array.isArray(stored.docs)) {
        this.docs = stored.docs;
        this.logger?.info?.('RAG index loaded', { docCount: this.docs.length });
      }
    } catch (error) {
      this.logger?.warn?.('Failed to load RAG index', { error: error.message });
    }
  }

  /**
   * Persist index to storage
   */
  async persist() {
    try {
      await storageSet(this.storageArea, {
        [RAG_STORAGE_KEY]: {
          docs: this.docs,
          version: 1,
          timestamp: Date.now(),
        }
      });
      this.logger?.info?.('RAG index persisted', { docCount: this.docs.length });
    } catch (error) {
      this.logger?.error?.('Failed to persist RAG index', { error: error.message });
      throw error;
    }
  }

  /**
   * Get embedding for text (with caching)
   */
  async _getEmbedding(text) {
    const cacheKey = text.slice(0, 200); // Cache by prefix
    
    if (this.embedCache.has(cacheKey)) {
      return this.embedCache.get(cacheKey);
    }

    let embedding;
    
    // Use LLM embedding if available
    if (this.llm && this.llm.embedCached) {
      try {
        embedding = await this.llm.embedCached(text);
      } catch (error) {
        this.logger?.warn?.('LLM embedding failed, using simple embedding', { 
          error: error.message 
        });
        embedding = simpleEmbed(text);
      }
    } else {
      // Fallback to simple embedding
      embedding = simpleEmbed(text);
    }

    this.embedCache.set(cacheKey, embedding);
    
    // Limit cache size
    if (this.embedCache.size > 1000) {
      const firstKey = this.embedCache.keys().next().value;
      this.embedCache.delete(firstKey);
    }

    return embedding;
  }

  /**
   * Add document to index
   * @param {string} text - Document text
   * @param {Object} meta - Document metadata
   * @returns {Promise<Object>} Document object
   */
  async add(text, meta = {}) {
    if (!text || typeof text !== 'string') {
      throw new Error('RAG add requires text');
    }

    const embedding = await this._getEmbedding(text);
    const doc = {
      id: generateUUID(),
      text,
      embedding,
      meta,
      timestamp: Date.now(),
    };

    this.docs.push(doc);

    // Limit total documents
    if (this.docs.length > this.maxDocuments) {
      // Remove oldest documents
      this.docs.sort((a, b) => b.timestamp - a.timestamp);
      this.docs = this.docs.slice(0, this.maxDocuments);
    }

    this.logger?.info?.('Document added to RAG', { 
      id: doc.id, 
      textLength: text.length,
      meta 
    });

    return doc;
  }

  /**
   * Replace all documents for a domain
   * @param {string} domain - Domain identifier
   * @param {Array<string>} texts - Array of document texts
   */
  async replaceDomain(domain, texts) {
    // Remove existing domain documents
    this.docs = this.docs.filter(d => d.meta?.domain !== domain);

    // Add new documents
    for (const text of texts) {
      await this.add(text, { domain });
    }

    this.logger?.info?.('Domain documents replaced', { 
      domain, 
      count: texts.length 
    });
  }

  /**
   * Query similar documents
   * @param {string} queryText - Query text
   * @param {Object} options - Query options
   * @param {number} options.k - Number of results to return
   * @param {number} options.minScore - Minimum similarity score (0-1)
   * @returns {Promise<Array<{doc: Object, score: number}>>}
   */
  async query(queryText, { k = 5, minScore = 0.1 } = {}) {
    if (!this.docs.length) {
      return [];
    }

    const queryEmbedding = await this._getEmbedding(queryText);

    // Compute similarity scores
    const scored = this.docs.map(doc => ({
      doc,
      score: cosine(queryEmbedding, doc.embedding),
    }));

    // Filter by minimum score
    const filtered = scored.filter(item => item.score >= minScore);

    // Sort by score descending
    filtered.sort((a, b) => b.score - a.score);

    // Return top k
    const results = filtered.slice(0, k);

    this.logger?.info?.('RAG query completed', { 
      queryLength: queryText.length,
      resultCount: results.length,
      topScore: results[0]?.score 
    });

    return results;
  }

  /**
   * Clear all documents
   */
  async clear() {
    this.docs = [];
    this.embedCache.clear();
    await this.persist();
    this.logger?.info?.('RAG index cleared');
  }

  /**
   * Get index statistics
   */
  getStats() {
    return {
      documentCount: this.docs.length,
      cacheSize: this.embedCache.size,
      totalSize: JSON.stringify(this.docs).length,
    };
  }
}

export const createRAGIndex = (options) => new RAGIndex(options);
