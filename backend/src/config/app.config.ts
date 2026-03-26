import { AppConfig } from '../types/config.types';
import { getConfigStore, getStoreType } from '../store';

const APP_CONFIG_KEY = 'app.json';

const defaultConfig: AppConfig = {
  server: { port: 3001, host: '0.0.0.0' },
  tsign: { encryptKey: '', token: '' },
  dispatch: { defaultTimeout: 10000, defaultRetryCount: 3, retryDelay: 1000 },
  log: { level: 'info', maxFiles: 30 },
};

let _appConfig: AppConfig = { ...defaultConfig };

export async function loadAppConfig(): Promise<AppConfig> {
  const store = getConfigStore();
  const stored = await store.read<Partial<AppConfig>>(APP_CONFIG_KEY, {});
  _appConfig = { ...defaultConfig, ...stored };
  return _appConfig;
}

export async function saveAppConfig(config: AppConfig): Promise<void> {
  const store = getConfigStore();
  await store.write(APP_CONFIG_KEY, config);
  _appConfig = config;
}

/**
 * 同步获取已加载的 appConfig（必须先调用 loadAppConfig）
 */
export function getAppConfig(): AppConfig {
  return _appConfig;
}

/**
 * 获取存储后端类型（供外部判断）
 */
export { getStoreType };

export { _appConfig as appConfig };
