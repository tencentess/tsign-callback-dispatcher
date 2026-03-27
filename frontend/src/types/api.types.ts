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
  msgTypes?: string[];
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

export type TagMatchMode = 'exact' | 'prefix';

export interface TagValue {
  key: string;
  value: string;
  matchMode?: TagMatchMode;
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

/** 分发记录（对应后端 DispatchRecord） */
export interface DispatchRecord {
  id: string;
  msgId: string;
  msgType: string;
  receivedAt: string;
  totalTargets: number;
  matchedTargets: number;
  successCount: number;
  failCount: number;
  error?: string;
  results: Array<{
    configId: string;
    configName: string;
    url: string;
    success: boolean;
    statusCode?: number;
    error?: string;
    errorType?: string;
    retryCount: number;
    duration?: number;
  }>;
}

/** 分发统计摘要 */
export interface DispatchStats {
  totalDispatched: number;
  totalSuccess: number;
  totalFailed: number;
  recentFailures: DispatchRecord[];
  bufferUsage: { used: number; capacity: number };
}

export interface OperationLog {
  id: string;
  type: 'config_change' | 'dispatch' | 'system';
  action: string;
  detail: string;
  timestamp: string;
}

export interface TSignConfig {
  encryptKey: string;
  token: string;
}

export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data?: T;
}
