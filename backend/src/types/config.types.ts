import { CallbackMsgType } from './callback.types';

export type TagMatchMode = 'exact' | 'prefix';

export interface TagValue {
  key: string;
  value: string;
  matchMode?: TagMatchMode;
}

export type AppType = 'company' | 'partner';
export type UnknownMsgTypePolicy = 'dispatch' | 'discard';
export type BuiltInTagMissPolicy = 'dispatch' | 'discard';

export interface DispatchConfig {
  id: string;
  name: string;
  url: string;
  appType: AppType;
  tags: TagValue[];
  matchRules: TagMatchRule[];
  enabled: boolean;
  retryCount: number;
  timeout: number;
  headers?: Record<string, string>;
  msgTypes?: CallbackMsgType[];
  unknownMsgTypePolicy?: UnknownMsgTypePolicy;
  builtInTagMissPolicy?: BuiltInTagMissPolicy;
  encryptKey?: string;
  signToken?: string;
  reEncrypt?: boolean;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TagMatchRule {
  id: string;
  name: string;
  field: string;
  operator: 'exact' | 'contains' | 'regex' | 'in' | 'exists';
  value: string | string[];
  tags: string[];
  enabled: boolean;
  description?: string;
}

export interface TagDefinition {
  id: string;
  name: string;
  key: string;
  type: 'text' | 'select';
  options?: string[];
  color: string;
  description?: string;
  builtIn?: boolean;
  fieldPath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CallbacksConfig {
  version: number;
  updatedAt: string;
  callbacks: DispatchConfig[];
}

export interface TagsConfig {
  version: number;
  updatedAt: string;
  tags: TagDefinition[];
}

export interface AppConfig {
  server: {
    port: number;
    host: string;
  };
  tsign: {
    encryptKey: string;
    token: string;
  };
  dispatch: {
    defaultTimeout: number;
    defaultRetryCount: number;
    retryDelay: number;
  };
  log: {
    level: string;
    maxFiles: number;
  };
}

export interface DispatchResult {
  configId: string;
  configName: string;
  url: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  errorType?: 'timeout' | 'dns' | 'connection_refused' | 'connection_reset' | 'server_error' | 'client_error' | 'network' | 'unknown';
  retryCount: number;
  timestamp: number;
  duration: number;
}

export interface OperationLog {
  id: string;
  type: 'config_change' | 'dispatch' | 'system';
  action: string;
  detail: string;
  timestamp: string;
  operator?: string;
}

export interface ConfigVersion {
  version: number;
  timestamp: string;
  changes: string;
  data: any;
}
