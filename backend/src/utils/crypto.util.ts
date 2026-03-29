import crypto from 'crypto';

/**
 * AES-256-CBC 解密
 * key 直接 UTF-8 编码为 32 字节，前 16 字节作为 IV，标准 PKCS7 自动填充
 */
export function decryptAES256CBC(encryptedBase64: string, encryptKey: string): string {
  const rawKey = Buffer.from(encryptKey, 'utf-8');
  const iv = rawKey.subarray(0, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', rawKey, iv);
  let decrypted = decipher.update(Buffer.from(encryptedBase64, 'base64'), undefined, 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Compute SHA1 signature from token, timestamp, nonce, and encrypt (sorted).
 * Shared core logic for both generateSignature and verifySignature.
 */
function computeSignature(token: string, timestamp: string, nonce: string, encrypt: string): string {
  const sortedArr = [token, timestamp, nonce, encrypt].sort();
  const str = sortedArr.join('');
  return crypto.createHash('sha1').update(str).digest('hex');
}

export function verifySignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypt: string,
  msgSignature: string
): boolean {
  return computeSignature(token, timestamp, nonce, encrypt) === msgSignature;
}

/**
 * 验证 Content-Signature (HMAC-SHA256)
 * 腾讯电子签平台通过 HTTP Header Content-Signature: sha256=xxx 传递签名
 * 签名计算: HMAC-SHA256(token, rawBody)，输出 hex 小写
 */
export function verifyContentSignature(
  token: string,
  rawBody: string,
  contentSignature: string
): boolean {
  // Content-Signature 格式: "sha256=xxxx"
  const expectedPrefix = 'sha256=';
  if (!contentSignature.startsWith(expectedPrefix)) {
    return false;
  }
  const receivedHmac = contentSignature.slice(expectedPrefix.length);
  const computedHmac = crypto
    .createHmac('sha256', token)
    .update(rawBody, 'utf8')
    .digest('hex');
  // 使用 timingSafeEqual 防止时序攻击
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computedHmac, 'hex'),
      Buffer.from(receivedHmac, 'hex')
    );
  } catch {
    return false;
  }
}

export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * 生成 32 字符的加密密钥（UTF-8 编码后恰好 32 字节，满足 AES-256 要求）
 */
export function generateEncryptKey(): string {
  return crypto.randomBytes(16).toString('hex'); // 32 hex chars = 32 bytes UTF-8
}

export function generateSignToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * AES-256-CBC 加密（e签宝官方实现）
 * key 直接 UTF-8 编码为 32 字节，前 16 字节作为 IV，标准 PKCS7 自动填充
 */
export function encryptAES256CBC(message: string, encryptKey: string): string {
  const rawKey = Buffer.from(encryptKey, 'utf-8');
  const iv = rawKey.subarray(0, 16);
  const cipher = crypto.createCipheriv('aes-256-cbc', rawKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(message, 'utf-8')),
    cipher.final(),
  ]);
  return encrypted.toString('base64');
}

export function generateSignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypt: string
): string {
  return computeSignature(token, timestamp, nonce, encrypt);
}
