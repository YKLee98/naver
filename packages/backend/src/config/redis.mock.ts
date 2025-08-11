// packages/backend/src/config/redis.mock.ts

export class RedisMock {
  private store: Map<string, any> = new Map();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async set(
    key: string,
    value: string,
    _mode?: string,
    _duration?: number
  ): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    return this.store.has(key) ? 1 : 0;
  }

  async expire(_key: string, _seconds: number): Promise<number> {
    return 1;
  }

  async ttl(_key: string): Promise<number> {
    return -1;
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  async quit(): Promise<void> {
    this.store.clear();
  }

  async hget(key: string, field: string): Promise<string | null> {
    const hash = this.store.get(key);
    if (!hash || typeof hash !== 'object') return null;
    return hash[field] || null;
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    let hash = this.store.get(key);
    if (!hash || typeof hash !== 'object') {
      hash = {};
    }
    hash[field] = value;
    this.store.set(key, hash);
    return 1;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const hash = this.store.get(key);
    if (!hash || typeof hash !== 'object') return {};
    return hash;
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.store.get(key);
    if (!Array.isArray(list)) return [];
    const end = stop === -1 ? list.length : stop + 1;
    return list.slice(start, end);
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    let list = this.store.get(key);
    if (!Array.isArray(list)) {
      list = [];
    }
    list.push(...values);
    this.store.set(key, list);
    return list.length;
  }

  async info(): Promise<string> {
    return 'redis_version:mock\nredis_mode:standalone';
  }
}
