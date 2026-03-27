import { TSignCallbackMessage } from '../types/callback.types';
import { DispatchConfig, DispatchResult } from '../types/config.types';
import { getCallbacksConfig } from './config.service';
import { shouldDispatch } from './tag-matcher.service';
import { httpPostWithRetry } from '../utils/http.util';
import { encryptAES256CBC, generateSignature, generateId } from '../utils/crypto.util';
import { getAppConfig } from '../config/app.config';
import logger from './logger.service';
import { addDispatchRecord } from './dispatch-log.service';

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

/**
 * 安全地检查单个 target 是否应该分发，隔离 tag-matcher 异常
 */
async function safeCheckShouldDispatch(
  message: TSignCallbackMessage,
  callbackConfig: DispatchConfig
): Promise<boolean> {
  try {
    return await shouldDispatch(message, callbackConfig);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(
      `[Dispatch] Tag matching error for "${callbackConfig.name}", skipping target. MsgId=${message.MsgId} error=${errMsg}`
    );
    // tag-matcher 异常时跳过此 target，不影响其他 target
    return false;
  }
}

/**
 * 安全分发到单个 target，完全隔离异常，确保不影响其他 target
 */
async function dispatchToTarget(
  message: TSignCallbackMessage,
  callbackConfig: DispatchConfig,
  appCfg: ReturnType<typeof getAppConfig>
): Promise<DispatchResult | null> {
  try {
    // Step 1: 标签匹配检查
    if (!(await safeCheckShouldDispatch(message, callbackConfig))) {
      logger.debug(`Skipping "${callbackConfig.name}": tag/type not matched`);
      return null;
    }

    // Step 2: 构建 payload
    const { data, params } = buildDispatchPayload(message, callbackConfig);
    const mode = params ? 'encrypted' : 'plaintext';
    logger.info(
      `[Dispatch START] "${callbackConfig.name}" → ${callbackConfig.url} [${mode}] MsgType=${message.MsgType} MsgId=${message.MsgId}`
    );

    // Step 3: HTTP 请求（带重试）
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

    // Step 4: 结构化日志
    const status = result.success ? 'SUCCESS' : 'FAILED';
    const logLevel = result.success ? 'info' : 'error';
    logger[logLevel](
      `[Dispatch ${status}] "${callbackConfig.name}" → ${callbackConfig.url} ` +
        `MsgType=${message.MsgType} MsgId=${message.MsgId} ` +
        `status=${result.statusCode || 'N/A'} duration=${result.duration}ms retries=${result.retryCount}` +
        (result.error ? ` error="${result.error}"` : '')
    );

    return dispatchResult;
  } catch (err) {
    // 兜底：即使上面所有逻辑出了未预期异常，也不会影响其他 target
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(
      `[Dispatch EXCEPTION] "${callbackConfig.name}" → ${callbackConfig.url} ` +
        `MsgType=${message.MsgType} MsgId=${message.MsgId} error="${errMsg}"`
    );
    return {
      configId: callbackConfig.id,
      configName: callbackConfig.name,
      url: callbackConfig.url,
      success: false,
      error: `Unhandled exception: ${errMsg}`,
      retryCount: 0,
      timestamp: Date.now(),
      duration: 0,
    };
  }
}

export async function dispatchMessage(message: TSignCallbackMessage): Promise<DispatchResult[]> {
  const dispatchStartTime = Date.now();
  let config;

  try {
    config = await getCallbacksConfig();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(
      `[Dispatch] Failed to load callbacks config, aborting dispatch. MsgId=${message.MsgId} error="${errMsg}"`
    );
    // 记录到分发日志
    addDispatchRecord({
      msgId: message.MsgId,
      msgType: message.MsgType,
      receivedAt: new Date().toISOString(),
      totalTargets: 0,
      matchedTargets: 0,
      successCount: 0,
      failCount: 0,
      results: [],
      error: `Config load failed: ${errMsg}`,
    });
    return [];
  }

  const results: DispatchResult[] = [];
  const enabledCallbacks = config.callbacks.filter((c) => c.enabled);

  logger.info(
    `[Dispatch] Processing MsgType=${message.MsgType} MsgId=${message.MsgId} ` +
      `enabledTargets=${enabledCallbacks.length} totalTargets=${config.callbacks.length}`
  );

  if (enabledCallbacks.length === 0) {
    logger.warn(`[Dispatch] No enabled targets found for MsgId=${message.MsgId}`);
    addDispatchRecord({
      msgId: message.MsgId,
      msgType: message.MsgType,
      receivedAt: new Date().toISOString(),
      totalTargets: 0,
      matchedTargets: 0,
      successCount: 0,
      failCount: 0,
      results: [],
    });
    return [];
  }

  const appCfg = getAppConfig();

  // 使用 Promise.allSettled 代替 Promise.all，确保所有 target 独立完成
  const settledResults = await Promise.allSettled(
    enabledCallbacks.map((callbackConfig) =>
      dispatchToTarget(message, callbackConfig, appCfg)
    )
  );

  for (let i = 0; i < settledResults.length; i++) {
    const settled = settledResults[i];
    const callbackConfig = enabledCallbacks[i];

    if (settled.status === 'fulfilled' && settled.value) {
      results.push(settled.value);
    } else if (settled.status === 'rejected') {
      // Promise.allSettled 被 reject 的情况（理论上不会发生，因为 dispatchToTarget 内部已 try-catch）
      const errMsg = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
      logger.error(
        `[Dispatch REJECTED] "${callbackConfig.name}" → ${callbackConfig.url} ` +
          `MsgId=${message.MsgId} error="${errMsg}"`
      );
      results.push({
        configId: callbackConfig.id,
        configName: callbackConfig.name,
        url: callbackConfig.url,
        success: false,
        error: `Promise rejected: ${errMsg}`,
        retryCount: 0,
        timestamp: Date.now(),
        duration: 0,
      });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  const totalDuration = Date.now() - dispatchStartTime;

  // 分发汇总日志
  const summaryLevel = failCount > 0 ? 'warn' : 'info';
  logger[summaryLevel](
    `[Dispatch SUMMARY] MsgType=${message.MsgType} MsgId=${message.MsgId} ` +
      `matched=${results.length}/${enabledCallbacks.length} ` +
      `success=${successCount} fail=${failCount} totalDuration=${totalDuration}ms`
  );

  // 记录分发日志到持久化存储
  addDispatchRecord({
    msgId: message.MsgId,
    msgType: message.MsgType,
    receivedAt: new Date().toISOString(),
    totalTargets: enabledCallbacks.length,
    matchedTargets: results.length,
    successCount,
    failCount,
    results: results.map((r) => ({
      configId: r.configId,
      configName: r.configName,
      url: r.url,
      success: r.success,
      statusCode: r.statusCode,
      error: r.error,
      retryCount: r.retryCount,
      duration: r.duration,
    })),
  });

  return results;
}
