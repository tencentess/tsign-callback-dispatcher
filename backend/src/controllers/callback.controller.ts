import { Request, Response } from 'express';
import { EncryptedCallbackMessage } from '../types/callback.types';
import { decryptCallbackMessage, verifyCallbackSignature, verifyContentSignatureHeader } from '../services/decrypt.service';
import { dispatchMessage } from '../services/dispatch.service';
import { getDispatchRecords, getDispatchStats } from '../services/dispatch-log.service';
import { getAppConfig } from '../config/app.config';
import { writeWal, removeWal } from '../services/wal.service';
import logger from '../services/logger.service';

/** Maximum number of received callbacks to keep in memory (test mode only) */
const MAX_RECEIVED = 50;
let receivedCallbacks: Array<{ msgId: string; msgType: string; receivedAt: string; message: Record<string, unknown> }> = [];

// ── 回调诊断信息（内存中保存最近一条非探测请求的失败信息） ──
export interface CallbackDiagnostic {
  type: 'signature_no_token' | 'signature_failed' | 'signature_missing' | 'decrypt_failed';
  message: string;
  timestamp: string;
  ip: string;
}

let lastCallbackDiagnostic: CallbackDiagnostic | null = null;

function updateCallbackDiagnostic(diag: CallbackDiagnostic): void {
  lastCallbackDiagnostic = diag;
}

export function getCallbackDiagnostic(): CallbackDiagnostic | null {
  return lastCallbackDiagnostic;
}

export async function handleCallback(req: Request, res: Response): Promise<void> {
  const callbackReceivedAt = new Date().toISOString();

  try {
    const { timestamp, nonce, msg_signature } = req.query as Record<string, string>;
    const body = req.body as EncryptedCallbackMessage;
    const contentSignature = req.get('content-signature') || '';
    const rawBody = (req as any).rawBody as string | undefined;

    // ── 平台探测请求：body 不含 encrypt 字段时直接返回 200 ──
    // 腾讯电子签平台会用空 body '{}' 探测回调地址可达性
    // 注意：探测请求也可能携带 content-signature header，但不含 encrypt 字段
    if (!body?.encrypt) {
      logger.info(`[Callback] Probe request detected (no encrypt field in body), returning 200`);
      logger.debug('[Callback] Probe request raw info', {
        method: req.method,
        url: req.originalUrl,
        headers: req.headers,
        body: req.body,
        ip: req.ip || req.socket?.remoteAddress,
        contentType: req.get('content-type'),
      });
      res.status(200).json({ code: 0, message: 'success' });
      return;
    }

    logger.info(`[Callback] Received callback from TSign platform at ${callbackReceivedAt}`);
    logger.debug('[Callback] Raw request info', {
      method: req.method,
      url: req.originalUrl,
      query: req.query,
      headers: req.headers,
      bodyKeys: body ? Object.keys(body) : [],
      encryptLength: body?.encrypt?.length || 0,
      ip: req.ip || req.socket?.remoteAddress,
      hasContentSignature: !!contentSignature,
      hasRawBody: !!rawBody,
    });

    // SEC-003: Verify signature whenever token is configured (all environments)
    const { token: signToken } = getAppConfig().tsign;

    // ── 签名验证：支持两种模式 ──
    // 模式 A: URL query 参数 msg_signature + timestamp + nonce (SHA1)
    // 模式 B: HTTP Header Content-Signature: sha256=xxx (HMAC-SHA256，腾讯电子签主用)
    //
    // 重要：如果请求携带了签名参数，说明平台要求验签。
    //       此时若未配置 token，应当拒绝请求并提示配置 token。
    const hasSignatureInRequest = !!(contentSignature || (msg_signature && timestamp && nonce));

    if (hasSignatureInRequest && !signToken) {
      // 请求携带签名但未配置 token → 无法验签，拒绝
      const reason = 'Request contains signature but no token configured. Please configure the sign token in settings.';
      logger.warn(`[Callback] ${reason}`, {
        hasContentSignature: !!contentSignature,
        hasMsgSignature: !!msg_signature,
      });
      updateCallbackDiagnostic({
        type: 'signature_no_token',
        message: '请求携带签名但未配置签名验证 Token，请在「回调加密配置」中设置 Token',
        timestamp: callbackReceivedAt,
        ip: (req.ip || req.socket?.remoteAddress) ?? '',
      });
      res.status(403).json({ code: 403, message: reason });
      return;
    }

    if (contentSignature && rawBody && signToken) {
      // 模式 B: Content-Signature Header (HMAC-SHA256)
      const valid = verifyContentSignatureHeader(rawBody, contentSignature);
      if (!valid) {
        logger.warn('[Callback] Content-Signature HMAC-SHA256 verification failed', {
          contentSignature,
          rawBodyLength: rawBody.length,
        });
        updateCallbackDiagnostic({
          type: 'signature_failed',
          message: 'Content-Signature HMAC-SHA256 签名验证失败，请检查 Token 是否正确',
          timestamp: callbackReceivedAt,
          ip: (req.ip || req.socket?.remoteAddress) ?? '',
        });
        res.status(403).json({ code: 403, message: 'Content-Signature verification failed' });
        return;
      }
      logger.debug('[Callback] Content-Signature HMAC-SHA256 verification passed');
    } else if (msg_signature && timestamp && nonce && body.encrypt && signToken) {
      // 模式 A: URL query 参数 (SHA1)
      const valid = verifyCallbackSignature(timestamp, nonce, body.encrypt, msg_signature);
      if (!valid) {
        logger.warn('[Callback] URL query signature (SHA1) verification failed', {
          timestamp,
          nonce,
          hasEncrypt: !!body.encrypt,
        });
        updateCallbackDiagnostic({
          type: 'signature_failed',
          message: 'URL query SHA1 签名验证失败，请检查 Token 是否正确',
          timestamp: callbackReceivedAt,
          ip: (req.ip || req.socket?.remoteAddress) ?? '',
        });
        res.status(403).json({ code: 403, message: 'Signature verification failed' });
        return;
      }
      logger.debug('[Callback] URL query signature (SHA1) verification passed');
    } else if (signToken && !hasSignatureInRequest) {
      // Token 已配置但请求中无任何签名 → 拒绝
      logger.warn('[Callback] Missing signature with token configured', {
        hasContentSignature: !!contentSignature,
        hasRawBody: !!rawBody,
        hasMsgSignature: !!msg_signature,
        hasTimestamp: !!timestamp,
        hasNonce: !!nonce,
      });
      logger.debug('[Callback] Raw request debug info for missing signature', {
        method: req.method,
        url: req.originalUrl,
        query: req.query,
        headers: req.headers,
        body: req.body,
        ip: req.ip || req.socket?.remoteAddress,
        contentType: req.get('content-type'),
      });
      updateCallbackDiagnostic({
        type: 'signature_missing',
        message: '已配置 Token 但请求中没有签名参数',
        timestamp: callbackReceivedAt,
        ip: (req.ip || req.socket?.remoteAddress) ?? '',
      });
      res.status(403).json({ code: 403, message: 'Signature verification required' });
      return;
    }

    // Decrypt message
    const message = decryptCallbackMessage(body);
    if (!message) {
      logger.error('[Callback] Failed to decrypt callback message', {
        hasEncrypt: !!body.encrypt,
        encryptLength: body.encrypt?.length || 0,
      });
      updateCallbackDiagnostic({
        type: 'decrypt_failed',
        message: '回调消息解密失败，请检查 EncryptKey 是否正确',
        timestamp: callbackReceivedAt,
        ip: (req.ip || req.socket?.remoteAddress) ?? '',
      });
      res.status(400).json({ code: 400, message: 'Failed to decrypt message' });
      return;
    }

    logger.info(
      `[Callback] Decrypted message: MsgId=${message.MsgId} MsgType=${message.MsgType} MsgVersion=${message.MsgVersion}`
    );

    // 解密成功 → 清除诊断告警（系统恢复正常）
    lastCallbackDiagnostic = null;

    // Record received callback only in test environment
    if (process.env.NODE_ENV === 'test') {
      receivedCallbacks.push({
        msgId: message.MsgId,
        msgType: message.MsgType,
        receivedAt: callbackReceivedAt,
        message: message as unknown as Record<string, unknown>,
      });
      if (receivedCallbacks.length > MAX_RECEIVED) {
        receivedCallbacks = receivedCallbacks.slice(-MAX_RECEIVED);
      }
    }

    // ── WAL: 先持久化再回复 200，防止分发过程中进程崩溃导致消息丢失 ──
    let walPath: string | null = null;
    try {
      walPath = writeWal(message as unknown as Record<string, unknown>, callbackReceivedAt);
    } catch (walErr) {
      // WAL 写入失败不应阻塞回调处理，降级为无 WAL 保护模式
      const walErrMsg = walErr instanceof Error ? walErr.message : String(walErr);
      logger.error(`[Callback] WAL write failed, proceeding without crash protection: ${walErrMsg}`);
    }

    // Return success immediately, dispatch asynchronously
    // 腾讯电子签平台要求及时返回成功，否则会触发重试
    res.status(200).json({ code: 0, message: 'success' });

    // Dispatch to configured targets (fully fault-tolerant)
    // 此处使用 setImmediate 确保 response 已完成发送后再执行分发
    const capturedWalPath = walPath;
    setImmediate(async () => {
      try {
        const results = await dispatchMessage(message);
        const successCount = results.filter((r) => r.success).length;
        const failCount = results.filter((r) => !r.success).length;

        if (failCount > 0) {
          logger.warn(
            `[Callback] Dispatch completed with failures: MsgId=${message.MsgId} ` +
              `success=${successCount} fail=${failCount} total=${results.length}`
          );
        } else {
          logger.info(
            `[Callback] Dispatch completed: MsgId=${message.MsgId} ` +
              `success=${successCount} total=${results.length}`
          );
        }

        // ── WAL: 分发完成后（无论成败），删除 WAL ──
        // 分发失败的情况已由 httpPostWithRetry 内部重试处理，
        // 到这里说明所有重试已耗尽，不需要再通过 WAL 恢复
        if (capturedWalPath) {
          removeWal(capturedWalPath);
        }
      } catch (dispatchErr) {
        // 最外层兜底，理论上不应该到这里（dispatchMessage 内部已完全容错）
        const errMsg = dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr);
        logger.error(
          `[Callback] CRITICAL: Unhandled dispatch error for MsgId=${message.MsgId}: ${errMsg}`,
          { stack: dispatchErr instanceof Error ? dispatchErr.stack : undefined }
        );
        // WAL 保留不删除，下次启动时恢复
      }
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[Callback] Unhandled error in handleCallback: ${errMsg}`, {
      stack: err instanceof Error ? err.stack : undefined,
    });
    if (!res.headersSent) {
      res.status(500).json({ code: 500, message: 'Internal server error' });
    }
  }
}

/**
 * 获取分发记录列表（管理端 API）
 */
export function getDispatchHistory(req: Request, res: Response): void {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
  const search = (req.query.search as string) || '';
  const { records, total } = getDispatchRecords(limit, offset, search);
  res.json({ code: 0, message: 'success', data: { records, total, limit, offset } });
}

/**
 * 获取分发统计摘要（管理端 API）
 */
export function getDispatchStatsApi(req: Request, res: Response): void {
  const stats = getDispatchStats();
  res.json({ code: 0, message: 'success', data: stats });
}

export function getReceivedCallbacks(req: Request, res: Response): void {
  res.json({ code: 0, message: 'success', data: receivedCallbacks });
}

export function clearReceivedCallbacks(req: Request, res: Response): void {
  receivedCallbacks = [];
  res.json({ code: 0, message: 'Cleared' });
}
