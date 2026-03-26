import { TSignCallbackMessage } from '../types/callback.types';
import { DispatchConfig, DispatchResult } from '../types/config.types';
import { getCallbacksConfig } from './config.service';
import { shouldDispatch } from './tag-matcher.service';
import { httpPostWithRetry } from '../utils/http.util';
import { encryptAES256CBC, generateSignature, generateId } from '../utils/crypto.util';
import { getAppConfig } from '../config/app.config';
import logger from './logger.service';

function buildDispatchPayload(message: TSignCallbackMessage, callbackConfig: DispatchConfig) {
  if (callbackConfig.reEncrypt && callbackConfig.encryptKey) {
    try {
      const jsonStr = JSON.stringify(message);
      const encrypted = encryptAES256CBC(jsonStr, callbackConfig.encryptKey);
      const timestamp = String(Math.floor(Date.now() / 1000));
      const nonce = generateId().replace(/-/g, '');
      const token = callbackConfig.signToken || '';
      const msgSignature = generateSignature(token, timestamp, nonce, encrypted);

      return {
        data: { encrypt: encrypted },
        params: { timestamp, nonce, msg_signature: msgSignature },
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Re-encryption failed for "${callbackConfig.name}": ${errMsg}, falling back to plaintext`);
    }
  }

  return { data: message, params: undefined };
}

export async function dispatchMessage(message: TSignCallbackMessage): Promise<DispatchResult[]> {
  const config = await getCallbacksConfig();
  const results: DispatchResult[] = [];

  const enabledCallbacks = config.callbacks.filter((c) => c.enabled);
  logger.debug(
    `Dispatching message MsgType=${message.MsgType} MsgId=${message.MsgId} to ${enabledCallbacks.length} enabled targets`
  );

  const appCfg = getAppConfig();
  const dispatchPromises = enabledCallbacks.map(async (callbackConfig) => {
    if (!(await shouldDispatch(message, callbackConfig))) {
      logger.debug(`Skipping ${callbackConfig.name}: tag/type not matched`);
      return null;
    }

    const { data, params } = buildDispatchPayload(message, callbackConfig);
    const mode = params ? 'encrypted' : 'plaintext';
    logger.debug(`Dispatching to "${callbackConfig.name}" (${callbackConfig.url}) [${mode}]`);

    const result = await httpPostWithRetry({
      url: callbackConfig.url,
      data,
      params,
      headers: callbackConfig.headers,
      timeout: callbackConfig.timeout || appCfg.dispatch.defaultTimeout,
      retryCount: callbackConfig.retryCount ?? appCfg.dispatch.defaultRetryCount,
      retryDelay: appCfg.dispatch.retryDelay,
    });

    const dispatchResult: DispatchResult = {
      configId: callbackConfig.id,
      configName: callbackConfig.name,
      url: callbackConfig.url,
      success: result.success,
      statusCode: result.statusCode,
      error: result.error,
      retryCount: result.retryCount,
      timestamp: Date.now(),
      duration: result.duration,
    };

    const status = result.success ? 'SUCCESS' : 'FAILED';
    const logLevel = result.success ? 'debug' : 'warn';
    logger[logLevel](`[Dispatch ${status}] ${callbackConfig.name} → ${callbackConfig.url} MsgType=${message.MsgType} MsgId=${message.MsgId} ${result.duration}ms retries=${result.retryCount}`);

    if (!result.success) {
      logger.error(`Dispatch failed to "${callbackConfig.name}": ${result.error}`);
    }

    return dispatchResult;
  });

  const allResults = await Promise.all(dispatchPromises);
  for (const r of allResults) {
    if (r) {
      results.push(r);
    }
  }

  logger.debug(
    `Dispatch complete: ${results.filter((r) => r.success).length}/${results.length} succeeded`
  );

  return results;
}
