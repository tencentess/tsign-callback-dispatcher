import https from 'https';
import http from 'http';
import fs from 'fs';
import { ConfigStore } from './config-store.interface';

/**
 * 基于 K8s API 的 ConfigStore 实现
 * 通过 ServiceAccount 挂载的 token 访问 K8s API，读写 ConfigMap
 *
 * 环境变量:
 * - K8S_NAMESPACE: ConfigMap 所在命名空间 (默认从 ServiceAccount 读取)
 * - K8S_CONFIGMAP_NAME: ConfigMap 名称 (默认 "tsign-dispatcher-config")
 * - K8S_API_SERVER: API Server 地址 (Pod 内默认 https://kubernetes.default.svc)
 */
export class K8sConfigStore implements ConfigStore {
  private namespace: string;
  private configMapName: string;
  private apiServer: string;
  private token: string;
  private caCert: Buffer | undefined;

  // 内存缓存: ConfigMap data 字段的完整快照
  private cache: Record<string, string> = {};
  private cacheLoaded = false;

  constructor() {
    // In-cluster 配置
    const SA_TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';
    const SA_NS_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/namespace';
    const SA_CA_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';

    this.apiServer = process.env.K8S_API_SERVER || 'https://kubernetes.default.svc';
    this.configMapName = process.env.K8S_CONFIGMAP_NAME || 'tsign-dispatcher-config';

    // 命名空间: 优先环境变量, 否则从 ServiceAccount 读
    if (process.env.K8S_NAMESPACE) {
      this.namespace = process.env.K8S_NAMESPACE;
    } else if (fs.existsSync(SA_NS_PATH)) {
      this.namespace = fs.readFileSync(SA_NS_PATH, 'utf-8').trim();
    } else {
      this.namespace = 'default';
    }

    // Token
    if (fs.existsSync(SA_TOKEN_PATH)) {
      this.token = fs.readFileSync(SA_TOKEN_PATH, 'utf-8').trim();
    } else {
      this.token = process.env.K8S_TOKEN || '';
    }

    // CA 证书
    if (fs.existsSync(SA_CA_PATH)) {
      this.caCert = fs.readFileSync(SA_CA_PATH);
    }
  }

  private get configMapUrl(): string {
    return `${this.apiServer}/api/v1/namespaces/${this.namespace}/configmaps/${this.configMapName}`;
  }

  /**
   * 发起 K8s API 请求
   */
  private request(method: string, url: string, body?: string): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const isHttps = parsed.protocol === 'https:';
      const mod = isHttps ? https : http;

      const options: https.RequestOptions = {
        method,
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      };

      if (isHttps && this.caCert) {
        options.ca = this.caCert;
      }

      const req = mod.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: data }));
      });

      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  /**
   * 从 K8s API 加载完整 ConfigMap data
   */
  private async loadConfigMap(): Promise<Record<string, string>> {
    const resp = await this.request('GET', this.configMapUrl);
    if (resp.statusCode === 404) {
      // ConfigMap 不存在, 创建一个空的
      await this.createConfigMap();
      return {};
    }
    if (resp.statusCode !== 200) {
      throw new Error(`K8s API GET ConfigMap failed: ${resp.statusCode} ${resp.body}`);
    }
    const cm = JSON.parse(resp.body);
    return cm.data || {};
  }

  private async createConfigMap(): Promise<void> {
    const body = JSON.stringify({
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: this.configMapName,
        namespace: this.namespace,
      },
      data: {},
    });
    const resp = await this.request(
      'POST',
      `${this.apiServer}/api/v1/namespaces/${this.namespace}/configmaps`,
      body,
    );
    if (resp.statusCode !== 201 && resp.statusCode !== 409) {
      throw new Error(`K8s API CREATE ConfigMap failed: ${resp.statusCode} ${resp.body}`);
    }
  }

  /**
   * PATCH ConfigMap 的指定 data key
   * 使用 strategic merge patch
   */
  private async patchConfigMap(dataUpdates: Record<string, string | null>): Promise<void> {
    const patchBody = JSON.stringify({ data: dataUpdates });
    const parsed = new URL(this.configMapUrl);
    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;

    return new Promise((resolve, reject) => {
      const options: https.RequestOptions = {
        method: 'PATCH',
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/strategic-merge-patch+json',
          'Accept': 'application/json',
        },
      };
      if (isHttps && this.caCert) {
        options.ca = this.caCert;
      }
      const req = mod.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`K8s API PATCH failed: ${res.statusCode} ${data}`));
          }
        });
      });
      req.on('error', reject);
      req.write(patchBody);
      req.end();
    });
  }

  private async ensureCache(): Promise<void> {
    if (!this.cacheLoaded) {
      this.cache = await this.loadConfigMap();
      this.cacheLoaded = true;
    }
  }

  /**
   * key 在 ConfigMap 中的存储名:
   *   "callbacks.json" -> "callbacks.json"
   *   "versions/callbacks-v1.json" -> "versions__callbacks-v1.json" (扁平化路径)
   */
  private toDataKey(key: string): string {
    return key.replace(/\//g, '__');
  }

  private fromDataKey(dataKey: string): string {
    return dataKey.replace(/__/g, '/');
  }

  async read<T>(key: string, defaultValue: T): Promise<T> {
    await this.ensureCache();
    const dataKey = this.toDataKey(key);
    const raw = this.cache[dataKey];
    if (raw === undefined) return defaultValue;
    return JSON.parse(raw) as T;
  }

  async write(key: string, data: unknown): Promise<void> {
    const dataKey = this.toDataKey(key);
    const value = JSON.stringify(data, null, 2);

    // 更新远端
    await this.patchConfigMap({ [dataKey]: value });

    // 更新本地缓存
    this.cache[dataKey] = value;
  }

  async exists(key: string): Promise<boolean> {
    await this.ensureCache();
    return this.toDataKey(key) in this.cache;
  }

  async remove(key: string): Promise<void> {
    const dataKey = this.toDataKey(key);

    // 使用 strategic merge patch 删除 key (设为 null)
    await this.patchConfigMap({ [dataKey]: null as unknown as string });
    delete this.cache[dataKey];
  }

  async list(prefix: string): Promise<string[]> {
    await this.ensureCache();
    const dataPrefix = this.toDataKey(prefix);
    return Object.keys(this.cache)
      .filter((k) => k.startsWith(dataPrefix) && k.endsWith('.json'))
      .map((k) => this.fromDataKey(k))
      .sort();
  }

  // K8s 模式暂不支持 watch, 依赖内存缓存 + API 写入时同步
}
