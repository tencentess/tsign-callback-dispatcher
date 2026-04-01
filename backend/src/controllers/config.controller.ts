import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import * as configService from '../services/config.service';
import { generateEncryptKey, generateSignToken } from '../utils/crypto.util';
import { maskSecret } from '../utils/string.util';
import { loadAppConfig, saveAppConfig } from '../config/app.config';

// ========== Callbacks ==========
export async function getCallbacks(req: Request, res: Response): Promise<void> {
  const config = await configService.getCallbacksConfig();
  res.json({ code: 0, message: 'success', data: config.callbacks });
}

export async function getCallback(req: Request, res: Response): Promise<void> {
  const callback = await configService.getCallbackById(req.params.id);
  if (!callback) {
    res.status(404).json({ code: 404, message: 'Callback not found' });
    return;
  }
  res.json({ code: 0, message: 'success', data: callback });
}

export async function createCallback(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { name, url, appType = 'company', tags = [], matchRules = [], enabled = true, retryCount = 3, timeout = 10000, headers, msgTypes, unknownMsgTypePolicy, builtInTagMissPolicy, encryptKey, signToken, reEncrypt, remark } = req.body;
  // 校验重试次数范围
  const safeRetryCount = Math.min(Math.max(Number(retryCount) || 0, 0), 10);
  const newCallback = await configService.addCallback({
    name, url, appType, tags, matchRules, enabled, retryCount: safeRetryCount, timeout, headers, msgTypes, unknownMsgTypePolicy, builtInTagMissPolicy, encryptKey, signToken, reEncrypt, remark,
  }, req.user?.username);
  res.status(201).json({ code: 0, message: 'Created', data: newCallback });
}

export function generateKeys(req: Request, res: Response): void {
  const encryptKey = generateEncryptKey();
  const signToken = generateSignToken();
  res.json({ code: 0, message: 'success', data: { encryptKey, signToken } });
}

export async function editCallback(req: AuthenticatedRequest, res: Response): Promise<void> {
  // 如果请求体包含 retryCount，校验范围
  if (req.body.retryCount !== undefined) {
    req.body.retryCount = Math.min(Math.max(Number(req.body.retryCount) || 0, 0), 10);
  }
  const updated = await configService.updateCallback(req.params.id, req.body, req.user?.username);
  if (!updated) {
    res.status(404).json({ code: 404, message: 'Callback not found' });
    return;
  }
  res.json({ code: 0, message: 'Updated', data: updated });
}

export async function removeCallback(req: AuthenticatedRequest, res: Response): Promise<void> {
  const success = await configService.deleteCallback(req.params.id, req.user?.username);
  if (!success) {
    res.status(404).json({ code: 404, message: 'Callback not found' });
    return;
  }
  res.json({ code: 0, message: 'Deleted' });
}

// ========== Tags ==========
export async function getTags(req: Request, res: Response): Promise<void> {
  const config = await configService.getTagsConfig();
  res.json({ code: 0, message: 'success', data: config.tags });
}

export async function getTag(req: Request, res: Response): Promise<void> {
  const tag = await configService.getTagById(req.params.id);
  if (!tag) {
    res.status(404).json({ code: 404, message: 'Tag not found' });
    return;
  }
  res.json({ code: 0, message: 'success', data: tag });
}

export async function createTag(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { name, key, type = 'text', options, color = '#1890ff', description } = req.body;
  const newTag = await configService.addTag({ name, key, type, options, color, description }, req.user?.username);
  res.status(201).json({ code: 0, message: 'Created', data: newTag });
}

export async function editTag(req: AuthenticatedRequest, res: Response): Promise<void> {
  const updated = await configService.updateTag(req.params.id, req.body, req.user?.username);
  if (!updated) {
    res.status(404).json({ code: 404, message: 'Tag not found' });
    return;
  }
  res.json({ code: 0, message: 'Updated', data: updated });
}

export async function removeTag(req: AuthenticatedRequest, res: Response): Promise<void> {
  const success = await configService.deleteTag(req.params.id, req.user?.username);
  if (!success) {
    res.status(404).json({ code: 404, message: 'Tag not found' });
    return;
  }
  res.json({ code: 0, message: 'Deleted' });
}

// ========== Logs & Stats ==========
export async function getLogs(req: Request, res: Response): Promise<void> {
  const limit = parseInt(req.query.limit as string) || 100;
  const offset = parseInt(req.query.offset as string) || 0;
  const result = await configService.getOperationLogs(limit, offset);
  res.json({ code: 0, message: 'success', data: result });
}

// ========== Versions ==========
export async function getVersions(req: Request, res: Response): Promise<void> {
  const configType = req.params.type;
  if (!['callbacks', 'tags'].includes(configType)) {
    res.status(400).json({ code: 400, message: 'Invalid config type' });
    return;
  }
  const versions = await configService.getConfigVersions(configType);
  res.json({ code: 0, message: 'success', data: versions });
}

export async function rollback(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { type } = req.params;
  const { version } = req.body;
  if (!['callbacks', 'tags'].includes(type)) {
    res.status(400).json({ code: 400, message: 'Invalid config type' });
    return;
  }
  const success = await configService.rollbackConfig(type, version, req.user?.username);
  if (!success) {
    res.status(404).json({ code: 404, message: 'Version not found' });
    return;
  }
  res.json({ code: 0, message: 'Rolled back successfully' });
}

// ========== TSign Config ==========
export async function getTSignConfig(req: Request, res: Response): Promise<void> {
  const config = await loadAppConfig();
  res.json({
    code: 0,
    message: 'success',
    data: {
      encryptKey: maskSecret(config.tsign.encryptKey || ''),
      token: maskSecret(config.tsign.token || ''),
      hasEncryptKey: !!config.tsign.encryptKey,
      hasToken: !!config.tsign.token,
    },
  });
}

export async function updateTSignConfig(req: Request, res: Response): Promise<void> {
  const { encryptKey, token } = req.body;
  if (typeof encryptKey !== 'string' || typeof token !== 'string') {
    res.status(400).json({ code: 400, message: 'encryptKey and token must be strings' });
    return;
  }
  const config = await loadAppConfig();

  // 判断是否应该更新某个字段：
  // - 空字符串 → 用户未填写，保留原值
  // - 包含 '****' → 前端回传的掩码值，保留原值
  // - 其他非空值 → 用户输入了新值，更新
  const shouldUpdate = (val: string) => val.length > 0 && !val.includes('****');
  config.tsign = {
    encryptKey: shouldUpdate(encryptKey) ? encryptKey : config.tsign.encryptKey,
    token: shouldUpdate(token) ? token : config.tsign.token,
  };
  await saveAppConfig(config);
  res.json({ code: 0, message: 'TSign config updated' });
}
