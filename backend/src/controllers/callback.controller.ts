import { Request, Response } from 'express';
import { EncryptedCallbackMessage } from '../types/callback.types';
import { decryptCallbackMessage, verifyCallbackSignature } from '../services/decrypt.service';
import { dispatchMessage } from '../services/dispatch.service';
import logger from '../services/logger.service';

const IS_TEST = process.env.NODE_ENV === 'test';
const MAX_RECEIVED = 50;
let receivedCallbacks: Array<{ msgId: string; msgType: string; receivedAt: string }> = [];

export async function handleCallback(req: Request, res: Response): Promise<void> {
  try {
    const { timestamp, nonce, msg_signature } = req.query as Record<string, string>;
    const body = req.body as EncryptedCallbackMessage;

    logger.debug('Received callback from TSign');

    // Verify signature (mandatory in production)
    if (msg_signature && timestamp && nonce && body.encrypt) {
      const valid = verifyCallbackSignature(timestamp, nonce, body.encrypt, msg_signature);
      if (!valid) {
        logger.warn('Callback signature verification failed');
        res.status(403).json({ code: 403, message: 'Signature verification failed' });
        return;
      }
    } else if (process.env.NODE_ENV === 'production') {
      // In production, signature parameters are mandatory when token is configured
      const { getAppConfig } = require('../config/app.config');
      const { token } = getAppConfig().tsign;
      if (token) {
        logger.warn('Missing signature parameters in production with token configured');
        res.status(403).json({ code: 403, message: 'Signature verification required' });
        return;
      }
    }

    // Decrypt message
    const message = decryptCallbackMessage(body);
    if (!message) {
      logger.error('Failed to decrypt callback message');
      res.status(400).json({ code: 400, message: 'Failed to decrypt message' });
      return;
    }

    // Record received callback only in test environment (lightweight summary, not full payload)
    if (IS_TEST) {
      receivedCallbacks.push({ msgId: message.MsgId, msgType: message.MsgType, receivedAt: new Date().toISOString() });
      if (receivedCallbacks.length > MAX_RECEIVED) {
        receivedCallbacks = receivedCallbacks.slice(-MAX_RECEIVED);
      }
    }

    // Return success immediately, dispatch asynchronously
    res.status(200).json({ code: 0, message: 'success' });

    // Dispatch to configured targets (errors handled internally)
    try {
      const results = await dispatchMessage(message);
      logger.debug(`Dispatched MsgId=${message.MsgId} to ${results.length} targets`);
    } catch (dispatchErr) {
      const errMsg = dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr);
      logger.error(`Dispatch failed for MsgId=${message.MsgId}: ${errMsg}`);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`handleCallback unhandled error: ${errMsg}`);
    if (!res.headersSent) {
      res.status(500).json({ code: 500, message: 'Internal server error' });
    }
  }
}

export function getReceivedCallbacks(req: Request, res: Response): void {
  res.json({ code: 0, message: 'success', data: receivedCallbacks });
}

export function clearReceivedCallbacks(req: Request, res: Response): void {
  receivedCallbacks = [];
  res.json({ code: 0, message: 'Cleared' });
}
