/**
 * ConfigStore 抽象接口
 *
 * 存储后端通过 CONFIG_STORE 环境变量选择：
 * - "file" (默认): 本地文件系统, 适合本地开发/单节点
 * - "k8s": K8s API 操作 ConfigMap, 适合 K8s 集群部署
 */
export interface ConfigStore {
  /** 读取指定 key 的 JSON 数据, 不存在则返回 defaultValue */
  read<T>(key: string, defaultValue: T): Promise<T>;

  /** 写入指定 key 的 JSON 数据 */
  write(key: string, data: unknown): Promise<void>;

  /** 检查指定 key 是否存在 */
  exists(key: string): Promise<boolean>;

  /** 删除指定 key */
  remove(key: string): Promise<void>;

  /** 列出指定前缀的所有 key */
  list(prefix: string): Promise<string[]>;

  /**
   * 监听指定 key 的变更（可选实现）
   * 返回取消监听的函数
   */
  watch?(key: string, callback: () => void): () => void;
}
