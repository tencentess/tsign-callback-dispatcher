import path from 'path';
import { ConfigStore } from './config-store.interface';
import { FileConfigStore } from './file-config-store';
import { K8sConfigStore } from './k8s-config-store';

export type { ConfigStore } from './config-store.interface';

/**
 * 存储后端类型, 通过 CONFIG_STORE 环境变量选择:
 * - "file" (默认): 本地文件系统
 * - "k8s": K8s API ConfigMap
 */
export type StoreType = 'file' | 'k8s';

let _store: ConfigStore | null = null;

export function getStoreType(): StoreType {
  const val = (process.env.CONFIG_STORE || 'file').toLowerCase();
  if (val === 'k8s' || val === 'kubernetes') return 'k8s';
  return 'file';
}

/**
 * 获取全局单例 ConfigStore
 */
export function getConfigStore(): ConfigStore {
  if (!_store) {
    const storeType = getStoreType();
    if (storeType === 'k8s') {
      _store = new K8sConfigStore();
    } else {
      const configDir = process.env.CONFIG_DIR || path.resolve(__dirname, '../../../config');
      _store = new FileConfigStore(configDir);
    }
  }
  return _store;
}

/**
 * 重置 store 单例（仅用于测试）
 */
export function resetConfigStore(): void {
  _store = null;
}
