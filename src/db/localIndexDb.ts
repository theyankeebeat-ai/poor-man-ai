/**
 * Local IndexedDB Database for Storing Categorized Search & AI Information.
 * Persists records locally with categorized indexes (source origin, query, tags).
 */

export type SourceEngineCategory =
  | 'duckduckgo-ai'
  | 'google-ai'
  | 'bing-copilot'
  | 'yandex-neuro'
  | 'web-reader'
  | 'brain-memory'
  | 'agent-log'
  | 'manual-entry';

export interface IndexRecord {
  id: string;
  category: SourceEngineCategory;
  title: string;
  query: string;
  content: string;
  sourceUrl?: string;
  tags: string[];
  metadata?: Record<string, any>;
  timestamp: string;
  createdAt: number;
}

const DB_NAME = 'TSX_AI_LOCAL_DB';
const DB_VERSION = 1;
const STORE_NAME = 'information_indexes';

export class LocalIndexDatabase {
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = this.openDatabase();
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB is not supported in this environment.'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });

          // Categorical and Query Indexes
          store.createIndex('by_category', 'category', { unique: false });
          store.createIndex('by_query', 'query', { unique: false });
          store.createIndex('by_createdAt', 'createdAt', { unique: false });
          store.createIndex('by_category_and_created', ['category', 'createdAt'], { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save or update an information record
   */
  async saveRecord(record: Omit<IndexRecord, 'createdAt'> & { createdAt?: number }): Promise<IndexRecord> {
    const db = await this.dbPromise;
    const fullRecord: IndexRecord = {
      ...record,
      createdAt: record.createdAt || Date.now()
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(fullRecord);

      req.onsuccess = () => resolve(fullRecord);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Retrieve all records
   */
  async getAllRecords(): Promise<IndexRecord[]> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Retrieve records filtered by category index (e.g. 'duckduckgo-ai', 'google-ai')
   */
  async getRecordsByCategory(category: SourceEngineCategory): Promise<IndexRecord[]> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('by_category');
      const req = index.getAll(IDBKeyRange.only(category));

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Delete a record by ID
   */
  async deleteRecord(id: string): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Clear all records in the store
   */
  async clearAll(): Promise<void> {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // Backward compatibility alias methods
  async getAll(category?: SourceEngineCategory): Promise<IndexRecord[]> {
    if (category) {
      return this.getRecordsByCategory(category);
    }
    return this.getAllRecords();
  }

  async save(record: Omit<IndexRecord, 'createdAt'> & { createdAt?: number }): Promise<IndexRecord> {
    return this.saveRecord(record);
  }

  async delete(id: string): Promise<void> {
    return this.deleteRecord(id);
  }
}

// Singleton database instance
export const localDb = new LocalIndexDatabase();
