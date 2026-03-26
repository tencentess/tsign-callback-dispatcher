import { Request, Response } from 'express';
import * as configService from '../services/config.service';
import { generateEncryptKey, generateSignToken } from '../utils/crypto.util';
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

export async function createCallback(req: Request, res: Response): Promise<void> {
  const { name, url, appType = 'company', tags = [], matchRules = [], enabled = true, retryCount = 3, timeout = 10000, headers, msgTypes, unknownMsgTypePolicy, builtInTagMissPolicy, encryptKey, signToken, reEncrypt, remark } = req.body;
  const newCallback = await configService.addCallback({
    name, url, appType, tags, matchRules, enabled, retryCount, timeout, headers, msgTypes, unknownMsgTypePolicy, builtInTagMissPolicy, encryptKey, signToken, reEncrypt, remark,
  });
  res.status(201).json({ code: 0, message: 'Created', data: newCallback });
}

export function generateKeys(req: Request, res: Response): void {
  const encryptKey = generateEncryptKey();
  const signToken = generateSignToken();
  res.json({ code: 0, message: 'success', data: { encryptKey, signToken } });
}

export async function editCallback(req: Request, res: Response): Promise<void> {
  const updated = await configService.updateCallback(req.params.id, req.body);
  if (!updated) {
    res.status(404).json({ code: 404, message: 'Callback not found' });
    return;
  }
  res.json({ code: 0, message: 'Updated', data: updated });
}

export async function removeCallback(req: Request, res: Response): Promise<void> {
  const success = await configService.deleteCallback(req.params.id);
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

export async function createTag(req: Request, res: Response): Promise<void> {
  const { name, key, type = 'text', options, color = '#1890ff', description } = req.body;
  const newTag = await configService.addTag({ name, key, type, options, color, description });
  res.status(201).json({ code: 0, message: 'Created', data: newTag });
}

export async function editTag(req: Request, res: Response): Promise<void> {
  const updated = await configService.updateTag(req.params.id, req.body);
  if (!updated) {
    res.status(404).json({ code: 404, message: 'Tag not found' });
    return;
  }
  res.json({ code: 0, message: 'Updated', data: updated });
}

export async function removeTag(req: Request, res: Response): Promise<void> {
  const success = await configService.deleteTag(req.params.id);
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

export async function rollback(req: Request, res: Response): Promise<void> {
  const { type } = req.params;
  const { version } = req.body;
  if (!['callbacks', 'tags'].includes(type)) {
    res.status(400).json({ code: 400, message: 'Invalid config type' });
    return;
  }
  const success = await configService.rollbackConfig(type, version);
  if (!success) {
    res.status(404).json({ code: 404, message: 'Version not found' });
    return;
  }
  res.json({ code: 0, message: 'Rolled back successfully' });
}

// ========== TSign Config ==========
function maskSecret(secret: string): string {
  if (!secret || secret.length <= 8) return secret ? '********' : '';
  return secret.substring(0, 4) + '****' + secret.substring(secret.length - 4);
}

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
  config.tsign = { encryptKey, token };
  await saveAppConfig(config);
  res.json({ code: 0, message: 'TSign config updated' });
}
