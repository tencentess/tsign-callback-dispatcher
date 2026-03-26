import { v4 as uuidv4 } from 'uuid';
import {
  CallbacksConfig,
  TagsConfig,
  DispatchConfig,
  TagDefinition,
  OperationLog,
  ConfigVersion,
} from '../types/config.types';
import { getConfigStore, ConfigStore } from '../store';
import logger from './logger.service';

// Store keys (相当于原来的文件名)
const CALLBACKS_KEY = 'callbacks.json';
const TAGS_KEY = 'tags.json';
const LOGS_KEY = 'operation-logs.json';
const VERSIONS_PREFIX = 'versions/';

let callbacksCache: CallbacksConfig | null = null;
let tagsCache: TagsConfig | null = null;
let operationLogs: OperationLog[] = [];

function store(): ConfigStore {
  return getConfigStore();
}

// 内置标签定义
const BUILT_IN_TAGS: Array<Omit<TagDefinition, 'id' | 'createdAt' | 'updatedAt'>> = [
  {
    name: '合同类型',
    key: 'FlowType',
    type: 'text',
    color: '#0052d9',
    description: '合同相关回调中的 FlowType 字段，用于按合同类型过滤分发',
    builtIn: true,
    fieldPath: 'MsgData.FlowType',
  },
  {
    name: '自定义数据',
    key: 'UserData',
    type: 'text',
    color: '#e37318',
    description: '合同相关回调中的 UserData 字段，用于按自定义业务数据过滤分发',
    builtIn: true,
    fieldPath: 'MsgData.UserData',
  },
];

async function ensureBuiltInTags(): Promise<void> {
  const tags = await getTagsConfig();
  let changed = false;
  for (const builtIn of BUILT_IN_TAGS) {
    const existing = tags.tags.find((t) => t.key === builtIn.key && t.builtIn);
    if (!existing) {
      const now = new Date().toISOString();
      tags.tags.unshift({
        ...builtIn,
        id: uuidv4(),
        createdAt: now,
        updatedAt: now,
      });
      changed = true;
      logger.debug(`Built-in tag "${builtIn.name}" (${builtIn.key}) initialized`);
    }
  }
  if (changed) {
    tags.updatedAt = new Date().toISOString();
    tags.version++;
    await store().write(TAGS_KEY, tags);
    tagsCache = tags;
  }
}

const MAX_OPERATION_LOGS = 500;
let logWriteTimer: ReturnType<typeof setTimeout> | null = null;

function flushLogsToFile(): void {
  store().write(LOGS_KEY, operationLogs).catch((err) => {
    logger.error(`Failed to flush operation logs: ${err}`);
  });
  logWriteTimer = null;
}

function addLog(type: OperationLog['type'], action: string, detail: string): void {
  const log: OperationLog = {
    id: uuidv4(),
    type,
    action,
    detail,
    timestamp: new Date().toISOString(),
  };
  operationLogs.unshift(log);
  if (operationLogs.length > MAX_OPERATION_LOGS) {
    operationLogs = operationLogs.slice(0, MAX_OPERATION_LOGS);
  }
  if (!logWriteTimer) {
    logWriteTimer = setTimeout(flushLogsToFile, 500);
  }
}

const MAX_VERSIONS = 50;

async function saveConfigVersion(configType: string, data: any, changes: string): Promise<void> {
  const prefix = `${VERSIONS_PREFIX}${configType}-v`;
  const files = await store().list(prefix);
  const nextVersion = files.length + 1;
  const version: ConfigVersion = {
    version: nextVersion,
    timestamp: new Date().toISOString(),
    changes,
    data,
  };
  const versionKey = `${VERSIONS_PREFIX}${configType}-v${nextVersion}.json`;
  await store().write(versionKey, version);

  // Prune oldest versions if exceeding limit
  if (files.length >= MAX_VERSIONS) {
    const toDelete = files.slice(0, files.length - MAX_VERSIONS + 1);
    for (const f of toDelete) {
      try { await store().remove(f); } catch { /* ignore */ }
    }
  }
}

// ========== Callbacks ==========
export async function getCallbacksConfig(): Promise<CallbacksConfig> {
  if (!callbacksCache) {
    callbacksCache = await store().read<CallbacksConfig>(CALLBACKS_KEY, {
      version: 1,
      updatedAt: '',
      callbacks: [],
    });
  }
  return callbacksCache;
}

export async function getCallbackById(id: string): Promise<DispatchConfig | undefined> {
  const config = await getCallbacksConfig();
  return config.callbacks.find((c) => c.id === id);
}

export async function addCallback(config: Omit<DispatchConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<DispatchConfig> {
  const callbacks = await getCallbacksConfig();
  const now = new Date().toISOString();
  const newConfig: DispatchConfig = {
    ...config,
    id: uuidv4(),
    createdAt: now,
    updatedAt: now,
  };
  callbacks.callbacks.push(newConfig);
  callbacks.updatedAt = now;
  callbacks.version++;
  await store().write(CALLBACKS_KEY, callbacks);
  callbacksCache = callbacks;
  await saveConfigVersion('callbacks', callbacks, `Added callback: ${newConfig.name}`);
  addLog('config_change', 'add_callback', `Added callback "${newConfig.name}" (${newConfig.url})`);
  return newConfig;
}

export async function updateCallback(id: string, updates: Partial<DispatchConfig>): Promise<DispatchConfig | null> {
  const callbacks = await getCallbacksConfig();
  const index = callbacks.callbacks.findIndex((c) => c.id === id);
  if (index === -1) return null;

  const now = new Date().toISOString();
  callbacks.callbacks[index] = { ...callbacks.callbacks[index], ...updates, updatedAt: now };
  callbacks.updatedAt = now;
  callbacks.version++;
  await store().write(CALLBACKS_KEY, callbacks);
  callbacksCache = callbacks;
  await saveConfigVersion('callbacks', callbacks, `Updated callback: ${callbacks.callbacks[index].name}`);
  addLog('config_change', 'update_callback', `Updated callback "${callbacks.callbacks[index].name}"`);
  return callbacks.callbacks[index];
}

export async function deleteCallback(id: string): Promise<boolean> {
  const callbacks = await getCallbacksConfig();
  const index = callbacks.callbacks.findIndex((c) => c.id === id);
  if (index === -1) return false;

  const deleted = callbacks.callbacks.splice(index, 1)[0];
  callbacks.updatedAt = new Date().toISOString();
  callbacks.version++;
  await store().write(CALLBACKS_KEY, callbacks);
  callbacksCache = callbacks;
  await saveConfigVersion('callbacks', callbacks, `Deleted callback: ${deleted.name}`);
  addLog('config_change', 'delete_callback', `Deleted callback "${deleted.name}" (${deleted.url})`);
  return true;
}

// ========== Tags ==========
export async function getTagsConfig(): Promise<TagsConfig> {
  if (!tagsCache) {
    tagsCache = await store().read<TagsConfig>(TAGS_KEY, {
      version: 1,
      updatedAt: '',
      tags: [],
    });
  }
  return tagsCache;
}

export async function getTagById(id: string): Promise<TagDefinition | undefined> {
  const config = await getTagsConfig();
  return config.tags.find((t) => t.id === id);
}

export async function addTag(tag: Omit<TagDefinition, 'id' | 'createdAt' | 'updatedAt'>): Promise<TagDefinition> {
  const tags = await getTagsConfig();
  const now = new Date().toISOString();
  const newTag: TagDefinition = {
    ...tag,
    id: uuidv4(),
    createdAt: now,
    updatedAt: now,
  };
  tags.tags.push(newTag);
  tags.updatedAt = now;
  tags.version++;
  await store().write(TAGS_KEY, tags);
  tagsCache = tags;
  addLog('config_change', 'add_tag', `Added tag "${newTag.name}"`);
  return newTag;
}

export async function updateTag(id: string, updates: Partial<TagDefinition>): Promise<TagDefinition | null> {
  const tags = await getTagsConfig();
  const index = tags.tags.findIndex((t) => t.id === id);
  if (index === -1) return null;

  const now = new Date().toISOString();
  tags.tags[index] = { ...tags.tags[index], ...updates, updatedAt: now };
  tags.updatedAt = now;
  tags.version++;
  await store().write(TAGS_KEY, tags);
  tagsCache = tags;
  addLog('config_change', 'update_tag', `Updated tag "${tags.tags[index].name}"`);
  return tags.tags[index];
}

export async function deleteTag(id: string): Promise<boolean> {
  const tags = await getTagsConfig();
  const index = tags.tags.findIndex((t) => t.id === id);
  if (index === -1) return false;

  if (tags.tags[index].builtIn) return false;

  const deleted = tags.tags.splice(index, 1)[0];
  tags.updatedAt = new Date().toISOString();
  tags.version++;
  await store().write(TAGS_KEY, tags);
  tagsCache = tags;
  addLog('config_change', 'delete_tag', `Deleted tag "${deleted.name}"`);
  return true;
}

// ========== Logs & Versions ==========
export async function getOperationLogs(limit = 100, offset = 0): Promise<{ logs: OperationLog[]; total: number }> {
  if (operationLogs.length === 0) {
    operationLogs = await store().read<OperationLog[]>(LOGS_KEY, []);
  }
  return {
    logs: operationLogs.slice(offset, offset + limit),
    total: operationLogs.length,
  };
}

export async function getConfigVersions(configType: string): Promise<ConfigVersion[]> {
  const prefix = `${VERSIONS_PREFIX}${configType}-v`;
  const keys = await store().list(prefix);
  const versions: ConfigVersion[] = [];
  for (const key of keys) {
    const v = await store().read<ConfigVersion>(key, {} as ConfigVersion);
    versions.push(v);
  }
  return versions;
}

export async function rollbackConfig(configType: string, version: number): Promise<boolean> {
  const versionKey = `${VERSIONS_PREFIX}${configType}-v${version}.json`;
  const exists = await store().exists(versionKey);
  if (!exists) return false;

  const versionData = await store().read<ConfigVersion>(versionKey, null as any);
  if (!versionData) return false;

  const targetKey = configType === 'callbacks' ? CALLBACKS_KEY : TAGS_KEY;
  await store().write(targetKey, versionData.data);

  if (configType === 'callbacks') callbacksCache = null;
  else tagsCache = null;

  addLog('config_change', 'rollback', `Rolled back ${configType} to version ${version}`);
  return true;
}

// ========== Hot Reload ==========
export async function initConfigWatcher(): Promise<void> {
  await ensureBuiltInTags();

  const s = store();
  if (s.watch) {
    s.watch(CALLBACKS_KEY, () => {
      logger.debug('Callbacks config changed, reloading...');
      callbacksCache = null;
      getCallbacksConfig().catch(() => {});
    });
    s.watch(TAGS_KEY, () => {
      logger.debug('Tags config changed, reloading...');
      tagsCache = null;
      getTagsConfig().catch(() => {});
    });
    logger.debug('Config file watchers initialized');
  } else {
    logger.debug('Config store does not support watch, hot-reload disabled');
  }
}

/** @deprecated Dispatch logs are now written via logger only, not to operation log file */
export function addDispatchLog(_detail: string): void {
  // No-op
}
