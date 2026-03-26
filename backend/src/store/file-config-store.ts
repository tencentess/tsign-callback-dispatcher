import fs from 'fs';
import path from 'path';
import { ConfigStore } from './config-store.interface';

/**
 * 基于本地文件系统的 ConfigStore 实现
 * 适合本地开发和单节点部署
 */
export class FileConfigStore implements ConfigStore {
  private baseDir: string;
  private watchers = new Map<string, fs.FSWatcher>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    // 检测目录是否可写，不可写则立即报错（常见于 K8s ConfigMap 只读挂载）
    try {
      const testFile = path.join(baseDir, '.write-test');
      fs.writeFileSync(testFile, '');
      fs.unlinkSync(testFile);
    } catch {
      throw new Error(
        `Config directory "${baseDir}" is read-only. ` +
        `If running in Kubernetes, set CONFIG_STORE=k8s to use K8s API instead of local filesystem.`
      );
    }
  }

  private resolvePath(key: string): string {
    // key 格式如 "callbacks.json" 或 "versions/callbacks-v1.json"
    return path.join(this.baseDir, key);
  }

  async read<T>(key: string, defaultValue: T): Promise<T> {
    const filePath = this.resolvePath(key);
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  }

  async write(key: string, data: unknown): Promise<void> {
    const filePath = this.resolvePath(key);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async exists(key: string): Promise<boolean> {
    return fs.existsSync(this.resolvePath(key));
  }

  async remove(key: string): Promise<void> {
    const filePath = this.resolvePath(key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  async list(prefix: string): Promise<string[]> {
    // prefix 可能包含目录部分，如 "versions/callbacks-v"
    const lastSlash = prefix.lastIndexOf('/');
    const dir = lastSlash >= 0 ? prefix.substring(0, lastSlash) : '';
    const filePrefix = lastSlash >= 0 ? prefix.substring(lastSlash + 1) : prefix;

    const fullDir = dir ? path.join(this.baseDir, dir) : this.baseDir;
    if (!fs.existsSync(fullDir)) return [];

    const files = fs.readdirSync(fullDir)
      .filter((f) => f.startsWith(filePrefix) && f.endsWith('.json'));

    return files.map((f) => (dir ? `${dir}/${f}` : f)).sort();
  }

  watch(key: string, callback: () => void): () => void {
    const filePath = this.resolvePath(key);
    if (!fs.existsSync(filePath)) return () => {};

    // 关闭已有的 watcher
    const existing = this.watchers.get(filePath);
    if (existing) existing.close();

    const watcher = fs.watch(filePath, (eventType) => {
      if (eventType === 'change') {
        const timer = this.debounceTimers.get(filePath);
        if (timer) clearTimeout(timer);
        this.debounceTimers.set(
          filePath,
          setTimeout(() => {
            callback();
            this.debounceTimers.delete(filePath);
          }, 500),
        );
      }
    });

    this.watchers.set(filePath, watcher);

    return () => {
      watcher.close();
      this.watchers.delete(filePath);
      const timer = this.debounceTimers.get(filePath);
      if (timer) {
        clearTimeout(timer);
        this.debounceTimers.delete(filePath);
      }
    };
  }
}
