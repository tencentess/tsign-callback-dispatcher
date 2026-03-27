import logger from './logger.service';

/**
 * 分发记录 — 记录每次回调分发的完整结果
 */
export interface DispatchRecord {
  id: string;
  msgId: string;
  msgType: string;
  receivedAt: string;
  totalTargets: number;
  matchedTargets: number;
  successCount: number;
  failCount: number;
  error?: string;
  results: Array<{
    configId: string;
    configName: string;
    url: string;
    success: boolean;
    statusCode?: number;
    error?: string;
    errorType?: string;
    retryCount: number;
    duration?: number;
  }>;
}

/**
 * 环形缓冲区 — 高性能的固定容量日志存储
 *
 * 相比 Array.unshift + slice：
 * - 写入 O(1)，无内存拷贝
 * - 读取（分页）O(limit)，按最近时间倒序
 * - 内存固定，不会因高频回调导致 GC 压力
 */
class RingBuffer<T> {
  private buffer: (T | undefined)[];
  private head = 0;     // 下一个写入位置
  private count = 0;    // 当前存储数量
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  /** 添加一条记录（最新的） */
  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  /** 按时间倒序获取（最新的在前），支持分页 */
  getRecent(limit: number, offset: number = 0): T[] {
    const result: T[] = [];
    const total = this.count;
    if (offset >= total) return result;

    const actualLimit = Math.min(limit, total - offset);
    for (let i = 0; i < actualLimit; i++) {
      // 从 head-1 开始倒序取（head-1 是最新写入的）
      const idx = ((this.head - 1 - offset - i) % this.capacity + this.capacity) % this.capacity;
      result.push(this.buffer[idx] as T);
    }
    return result;
  }

  /**
   * 按时间倒序获取，支持过滤 + 分页
   * 需要遍历所有记录来确定匹配总数和分页结果
   */
  filteredGetRecent(
    predicate: (item: T) => boolean,
    limit: number,
    offset: number = 0
  ): { items: T[]; matchedTotal: number } {
    const items: T[] = [];
    let matchedTotal = 0;

    for (let i = 0; i < this.count; i++) {
      const idx = ((this.head - 1 - i) % this.capacity + this.capacity) % this.capacity;
      const item = this.buffer[idx] as T;
      if (predicate(item)) {
        if (matchedTotal >= offset && items.length < limit) {
          items.push(item);
        }
        matchedTotal++;
      }
    }

    return { items, matchedTotal };
  }

  /** 获取所有记录的迭代器（倒序），用于统计聚合 */
  *iterateRecent(): Generator<T> {
    for (let i = 0; i < this.count; i++) {
      const idx = ((this.head - 1 - i) % this.capacity + this.capacity) % this.capacity;
      yield this.buffer[idx] as T;
    }
  }

  get size(): number {
    return this.count;
  }

  clear(): void {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.count = 0;
  }
}

// ── 配置 ──
const MAX_DISPATCH_RECORDS = 500;

// ── 存储实例 ──
const ringBuffer = new RingBuffer<DispatchRecord>(MAX_DISPATCH_RECORDS);

// ── 增量统计缓存（避免每次查询都遍历整个缓冲区）──
let statsTotalDispatched = 0;
let statsTotalSuccess = 0;
let statsTotalFailed = 0;

/** 自增 ID 生成器 */
let idSeq = 0;
function nextId(): string {
  return `d-${Date.now()}-${++idSeq}`;
}

/**
 * 添加分发记录
 */
export function addDispatchRecord(record: Omit<DispatchRecord, 'id'>): void {
  const fullRecord: DispatchRecord = { id: nextId(), ...record };
  ringBuffer.push(fullRecord);

  // 更新增量统计
  statsTotalDispatched++;
  statsTotalSuccess += record.successCount;
  statsTotalFailed += record.failCount;

  // 如果有失败的分发，额外打印告警日志方便运维监控 (grep/alerting)
  if (record.failCount > 0) {
    logger.warn(
      `[DISPATCH_ALERT] MsgId=${record.msgId} MsgType=${record.msgType} ` +
        `failCount=${record.failCount}/${record.matchedTargets} ` +
        `failedTargets=[${record.results
          .filter((r) => !r.success)
          .map((r) => `"${r.configName}"(${r.error || 'unknown'})`)
          .join(', ')}]`
    );
  }

  if (record.error) {
    logger.error(
      `[DISPATCH_ALERT] MsgId=${record.msgId} MsgType=${record.msgType} systemError="${record.error}"`
    );
  }
}

/**
 * 获取最近的分发记录（分页查询）
 *
 * @param limit  每页条数，上限 100
 * @param offset 偏移量
 * @param search 可选，按 msgId 或 msgType 模糊搜索
 */
export function getDispatchRecords(
  limit = 20,
  offset = 0,
  search?: string
): { records: DispatchRecord[]; total: number } {
  // 防止单次拉取过多
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const safeOffset = Math.max(offset, 0);

  if (search && search.trim()) {
    const keyword = search.trim().toLowerCase();
    const { items, matchedTotal } = ringBuffer.filteredGetRecent(
      (record) =>
        record.msgId.toLowerCase().includes(keyword) ||
        record.msgType.toLowerCase().includes(keyword),
      safeLimit,
      safeOffset
    );
    return { records: items, total: matchedTotal };
  }

  return {
    records: ringBuffer.getRecent(safeLimit, safeOffset),
    total: ringBuffer.size,
  };
}

/**
 * 获取分发统计摘要
 * - 总量统计来自增量缓存，O(1)
 * - 最近失败列表按需从缓冲区扫描，最多扫描 100 条即停
 */
export function getDispatchStats(): {
  totalDispatched: number;
  totalSuccess: number;
  totalFailed: number;
  recentFailures: DispatchRecord[];
  bufferUsage: { used: number; capacity: number };
} {
  const recentFailures: DispatchRecord[] = [];
  const MAX_FAILURES = 20;
  let scanned = 0;
  const MAX_SCAN = 200; // 最多扫描 200 条就停止

  for (const record of ringBuffer.iterateRecent()) {
    if (recentFailures.length >= MAX_FAILURES || scanned >= MAX_SCAN) break;
    if (record.failCount > 0 || !!record.error) {
      recentFailures.push(record);
    }
    scanned++;
  }

  return {
    totalDispatched: statsTotalDispatched,
    totalSuccess: statsTotalSuccess,
    totalFailed: statsTotalFailed,
    recentFailures,
    bufferUsage: { used: ringBuffer.size, capacity: MAX_DISPATCH_RECORDS },
  };
}

/**
 * 清空分发记录（用于测试）
 */
export function clearDispatchRecords(): void {
  ringBuffer.clear();
  statsTotalDispatched = 0;
  statsTotalSuccess = 0;
  statsTotalFailed = 0;
}
