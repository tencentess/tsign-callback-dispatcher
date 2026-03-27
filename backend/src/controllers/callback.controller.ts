import { Request, Response } from 'express';
import { EncryptedCallbackMessage } from '../types/callback.types';
import { decryptCallbackMessage, verifyCallbackSignature } from '../services/decrypt.service';
import { dispatchMessage } from '../services/dispatch.service';
import { getDispatchRecords, getDispatchStats } from '../services/dispatch-log.service';
import logger from '../services/logger.service';

/** Maximum number of received callbacks to keep in memory (test mode only) */
const MAX_RECEIVED = 50;
let receivedCallbacks: Array<{ msgId: string; msgType: string; receivedAt: string; message: Record<string, unknown> }> = [];

export async function handleCallback(req: Request, res: Response): Promise<void> {
  const callbackReceivedAt = new Date().toISOString();

  try {
    const { timestamp, nonce, msg_signature } = req.query as Record<string, string>;
    const body = req.body as EncryptedCallbackMessage;

    logger.info(`[Callback] Received callback from TSign platform at ${callbackReceivedAt}`);

    // SEC-003: Verify signature whenever token is configured (all environments)
    const { getAppConfig } = require('../config/app.config');
    const { token: signToken } = getAppConfig().tsign;

    if (msg_signature && timestamp && nonce && body.encrypt) {
      const valid = verifyCallbackSignature(timestamp, nonce, body.encrypt, msg_signature);
      if (!valid) {
        logger.warn('[Callback] Signature verification failed', {
          timestamp,
          nonce,
          hasEncrypt: !!body.encrypt,
        });
        res.status(403).json({ code: 403, message: 'Signature verification failed' });
        return;
      }
      logger.debug('[Callback] Signature verification passed');
    } else if (signToken) {
      // When token is configured, signature parameters are mandatory in ALL environments
      logger.warn('[Callback] Missing signature parameters with token configured', {
        hasSignature: !!msg_signature, hasTimestamp: !!timestamp, hasNonce: !!nonce,
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
      res.status(400).json({ code: 400, message: 'Failed to decrypt message' });
      return;
    }

    logger.info(
      `[Callback] Decrypted message: MsgId=${message.MsgId} MsgType=${message.MsgType} MsgVersion=${message.MsgVersion}`
    );

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

    // Return success immediately, dispatch asynchronously
    // 腾讯电子签平台要求及时返回成功，否则会触发重试
    res.status(200).json({ code: 0, message: 'success' });

    // Dispatch to configured targets (fully fault-tolerant)
    // 此处使用 setImmediate 确保 response 已完成发送后再执行分发
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
      } catch (dispatchErr) {
        // 最外层兜底，理论上不应该到这里（dispatchMessage 内部已完全容错）
        const errMsg = dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr);
        logger.error(
          `[Callback] CRITICAL: Unhandled dispatch error for MsgId=${message.MsgId}: ${errMsg}`,
          { stack: dispatchErr instanceof Error ? dispatchErr.stack : undefined }
        );
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
