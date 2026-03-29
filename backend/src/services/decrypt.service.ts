import { TSignCallbackMessage, EncryptedCallbackMessage } from '../types/callback.types';
import { decryptAES256CBC, verifySignature, verifyContentSignature } from '../utils/crypto.util';
import { getAppConfig } from '../config/app.config';
import logger from './logger.service';

export function decryptCallbackMessage(encrypted: EncryptedCallbackMessage): TSignCallbackMessage | null {
  const { encryptKey } = getAppConfig().tsign;

  try {
    if (!encryptKey) {
      logger.warn('No encrypt key configured, attempting to parse as plain JSON');
      const parsed = JSON.parse(encrypted.encrypt);
      return parsed as TSignCallbackMessage;
    }

    const decryptedStr = decryptAES256CBC(encrypted.encrypt, encryptKey);
    const message = JSON.parse(decryptedStr) as TSignCallbackMessage;
    logger.info(`Decrypted callback message: MsgType=${message.MsgType}, MsgId=${message.MsgId}`);
    return message;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to decrypt/parse callback message: ${errMsg}`);
    return null;
  }
}

export function verifyCallbackSignature(
  timestamp: string,
  nonce: string,
  encrypt: string,
  msgSignature: string
): boolean {
  const { token } = getAppConfig().tsign;
  if (!token) {
    logger.warn('No token configured, skipping signature verification');
    return true;
  }
  try {
    return verifySignature(token, timestamp, nonce, encrypt, msgSignature);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`Signature verification threw error: ${errMsg}`);
    return false;
  }
}

/**
 * 验证 Content-Signature Header (HMAC-SHA256)
 * 腾讯电子签平台通过 HTTP Header Content-Signature 传递签名
 */
export function verifyContentSignatureHeader(
  rawBody: string,
  contentSignature: string
): boolean {
  const { token } = getAppConfig().tsign;
  if (!token) {
    logger.warn('No token configured, skipping Content-Signature verification');
    return true;
  }
  try {
    const result = verifyContentSignature(token, rawBody, contentSignature);
    if (!result) {
      logger.warn('[Callback] Content-Signature HMAC-SHA256 verification failed', {
        contentSignature,
        bodyLength: rawBody.length,
      });
    }
    return result;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`Content-Signature verification threw error: ${errMsg}`);
    return false;
  }
}
