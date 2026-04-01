import fs from 'fs';
import path from 'path';
import logger from './logger.service';

/**
 * WAL（Write-Ahead Log）服务
 *
 * 解决的核心问题：
 *   回调消息在回复 200 后、分发完成前，如果进程崩溃会导致消息丢失。
 *   电子签平台已收到 200，不会重推，下游永远收不到这条回调。
 *
 * 工作流程：
 *   1. 收到回调 → 验签解密 → 写入 WAL 文件（同步 fsync）
 *   2. 回复 200
 *   3. 异步分发
 *   4. 分发完成 → 删除 WAL 文件
 *   5. 进程启动时扫描 pending 的 WAL → 自动重新分发
 *
 * 文件格式：
 *   {walDir}/{msgId}-{timestamp}.wal.json
 *   内容：{ message, receivedAt, attempts }
 *
 * 零外部依赖：只用 Node.js 原生 fs，不需要 MySQL/Redis/MQ。
 */

export interface WalEntry {
  /** 解密后的回调消息 */
  message: Record<string, unknown>;
  /** 收到回调的时间 */
  receivedAt: string;
  /** 已尝试分发次数（用于防止无限重试） */
  attempts: number;
  /** WAL 文件创建时间 */
  createdAt: string;
}

// ── 配置 ──
/** WAL 文件最大保留时间（毫秒），超过此时间的 WAL 不再重试，移入 dead-letter */
const WAL_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 小时
/** 最大重试分发次数 */
const WAL_MAX_ATTEMPTS = 5;
/** 启动时恢复分发的延迟（等待服务完全就绪） */
const RECOVERY_DELAY_MS = 5000;
/** 恢复时每条消息间的分发间隔（避免瞬间大量请求） */
const RECOVERY_INTERVAL_MS = 1000;

let walDir: string;
let deadLetterDir: string;

/**
 * 初始化 WAL 目录
 * @param baseDir WAL 文件存储的根目录，默认为项目根目录下的 data/wal
 */
export function initWal(baseDir?: string): void {
  walDir = baseDir || path.resolve(process.env.WAL_DIR || path.join(process.cwd(), 'data', 'wal'));
  deadLetterDir = path.join(walDir, 'dead-letter');

  for (const dir of [walDir, deadLetterDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  logger.info(`[WAL] Initialized, dir=${walDir}`);
}

/**
 * 生成 WAL 文件名
 */
function walFileName(msgId: string): string {
  // 去掉可能导致文件名问题的字符
  const safeMsgId = msgId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${safeMsgId}-${Date.now()}.wal.json`;
}

/**
 * 将消息写入 WAL（同步写入 + fsync，确保落盘）
 * 返回 WAL 文件路径，分发完成后需要调用 removeWal 删除
 */
export function writeWal(message: Record<string, unknown>, receivedAt: string): string {
  const msgId = (message.MsgId as string) || 'unknown';
  const fileName = walFileName(msgId);
  const filePath = path.join(walDir, fileName);

  const entry: WalEntry = {
    message,
    receivedAt,
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  const content = JSON.stringify(entry, null, 2);

  // 同步写入 + fsync 确保数据落盘
  const fd = fs.openSync(filePath, 'w');
  try {
    fs.writeSync(fd, content, 0, 'utf-8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  logger.debug(`[WAL] Written: ${fileName} (MsgId=${msgId})`);
  return filePath;
}

/**
 * 分发成功后删除 WAL 文件
 */
export function removeWal(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.debug(`[WAL] Removed: ${path.basename(filePath)}`);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`[WAL] Failed to remove ${path.basename(filePath)}: ${errMsg}`);
  }
}

/**
 * 更新 WAL 的尝试次数（分发失败但还可重试时）
 */
function updateWalAttempts(filePath: string, entry: WalEntry): void {
  try {
    const content = JSON.stringify(entry, null, 2);
    fs.writeFileSync(filePath, content, 'utf-8');
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`[WAL] Failed to update attempts for ${path.basename(filePath)}: ${errMsg}`);
  }
}

/**
 * 将无法恢复的 WAL 移入 dead-letter 目录
 */
function moveToDeadLetter(filePath: string, reason: string): void {
  try {
    const fileName = path.basename(filePath);
    const destPath = path.join(deadLetterDir, fileName);
    fs.renameSync(filePath, destPath);
    logger.warn(`[WAL] Moved to dead-letter: ${fileName}, reason: ${reason}`);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[WAL] Failed to move to dead-letter: ${errMsg}`);
    // 最后手段：直接删除，避免无限积累
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  }
}

/**
 * 扫描 WAL 目录中的 pending 文件
 */
export function scanPendingWals(): Array<{ filePath: string; entry: WalEntry }> {
  if (!walDir || !fs.existsSync(walDir)) return [];

  const files = fs.readdirSync(walDir).filter((f) => f.endsWith('.wal.json'));
  const results: Array<{ filePath: string; entry: WalEntry }> = [];

  for (const file of files) {
    const filePath = path.join(walDir, file);
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const entry = JSON.parse(raw) as WalEntry;
      results.push({ filePath, entry });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`[WAL] Failed to read ${file}: ${errMsg}`);
      // 文件损坏，移入 dead-letter
      moveToDeadLetter(filePath, `Parse error: ${errMsg}`);
    }
  }

  return results;
}

/**
 * 进程启动时恢复未完成的分发
 *
 * @param dispatchFn 分发函数，传入解密后的消息，返回是否全部成功
 */
export async function recoverPendingDispatches(
  dispatchFn: (message: Record<string, unknown>) => Promise<{ allSuccess: boolean; hasFailures: boolean }>
): Promise<void> {
  const pendings = scanPendingWals();

  if (pendings.length === 0) {
    logger.info('[WAL] No pending dispatches to recover');
    return;
  }

  logger.warn(`[WAL] Found ${pendings.length} pending dispatch(es), starting recovery in ${RECOVERY_DELAY_MS}ms...`);

  // 延迟恢复，等待服务完全就绪（配置加载、网络就绪等）
  await new Promise((resolve) => setTimeout(resolve, RECOVERY_DELAY_MS));

  let recovered = 0;
  let failed = 0;
  let expired = 0;

  for (const { filePath, entry } of pendings) {
    const msgId = (entry.message.MsgId as string) || 'unknown';
    const ageMs = Date.now() - new Date(entry.createdAt).getTime();

    // 检查是否超过最大保留时间
    if (ageMs > WAL_MAX_AGE_MS) {
      moveToDeadLetter(filePath, `Expired after ${Math.round(ageMs / 1000 / 60)}min (max=${WAL_MAX_AGE_MS / 1000 / 60}min)`);
      expired++;
      continue;
    }

    // 检查是否超过最大重试次数
    if (entry.attempts >= WAL_MAX_ATTEMPTS) {
      moveToDeadLetter(filePath, `Max attempts reached (${entry.attempts}/${WAL_MAX_ATTEMPTS})`);
      failed++;
      continue;
    }

    // 更新尝试次数
    entry.attempts++;
    updateWalAttempts(filePath, entry);

    logger.info(`[WAL] Recovering MsgId=${msgId} (attempt ${entry.attempts}/${WAL_MAX_ATTEMPTS}, age=${Math.round(ageMs / 1000)}s)`);

    try {
      const result = await dispatchFn(entry.message);

      if (result.allSuccess || !result.hasFailures) {
        // 全部成功或没有匹配的目标，删除 WAL
        removeWal(filePath);
        recovered++;
      } else {
        // 部分失败，保留 WAL 等下次启动重试
        logger.warn(`[WAL] MsgId=${msgId} partially failed, WAL retained for next recovery`);
        failed++;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`[WAL] Recovery dispatch failed for MsgId=${msgId}: ${errMsg}`);
      failed++;
    }

    // 恢复间隔，避免瞬间大量请求
    if (pendings.indexOf({ filePath, entry }) < pendings.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, RECOVERY_INTERVAL_MS));
    }
  }

  logger.info(
    `[WAL] Recovery completed: recovered=${recovered} failed=${failed} expired=${expired} total=${pendings.length}`
  );
}

/**
 * 获取 WAL 统计信息（供健康检查 / 管理端使用）
 */
export function getWalStats(): { pending: number; deadLetter: number } {
  let pending = 0;
  let deadLetter = 0;

  try {
    if (walDir && fs.existsSync(walDir)) {
      pending = fs.readdirSync(walDir).filter((f) => f.endsWith('.wal.json')).length;
    }
    if (deadLetterDir && fs.existsSync(deadLetterDir)) {
      deadLetter = fs.readdirSync(deadLetterDir).filter((f) => f.endsWith('.wal.json')).length;
    }
  } catch { /* ignore */ }

  return { pending, deadLetter };
}
