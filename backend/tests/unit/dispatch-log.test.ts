import { describe, it, expect, beforeEach } from 'vitest';
import {
  addDispatchRecord,
  getDispatchRecords,
  getDispatchStats,
  clearDispatchRecords,
  DispatchRecord,
} from '../../src/services/dispatch-log.service';

// Mock logger to suppress output
vi.mock('../../src/services/logger.service', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ---- 辅助函数 ----

function makeRecord(overrides: Partial<Omit<DispatchRecord, 'id'>> = {}): Omit<DispatchRecord, 'id'> {
  return {
    msgId: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    msgType: 'FlowStatusChange',
    receivedAt: new Date().toISOString(),
    totalTargets: 2,
    matchedTargets: 2,
    successCount: 2,
    failCount: 0,
    results: [
      {
        configId: 'cb-1',
        configName: '目标A',
        url: 'http://localhost:9001/callback',
        success: true,
        statusCode: 200,
        retryCount: 0,
        duration: 120,
      },
      {
        configId: 'cb-2',
        configName: '目标B',
        url: 'http://localhost:9002/callback',
        success: true,
        statusCode: 200,
        retryCount: 0,
        duration: 80,
      },
    ],
    ...overrides,
  };
}

function makeFailedRecord(overrides: Partial<Omit<DispatchRecord, 'id'>> = {}): Omit<DispatchRecord, 'id'> {
  return makeRecord({
    successCount: 1,
    failCount: 1,
    results: [
      {
        configId: 'cb-1',
        configName: '目标A',
        url: 'http://localhost:9001/callback',
        success: true,
        statusCode: 200,
        retryCount: 0,
        duration: 100,
      },
      {
        configId: 'cb-2',
        configName: '目标B',
        url: 'http://localhost:9002/callback',
        success: false,
        statusCode: 500,
        error: 'HTTP 500: Internal Server Error',
        errorType: 'server_error',
        retryCount: 3,
        duration: 5000,
      },
    ],
    ...overrides,
  });
}

// =====================================================
// 测试开始
// =====================================================

describe('dispatch-log.service', () => {
  beforeEach(() => {
    clearDispatchRecords();
  });

  // ── addDispatchRecord + getDispatchRecords ──

  describe('addDispatchRecord / getDispatchRecords 基础功能', () => {
    it('空记录时返回空数组和 total=0', () => {
      const { records, total } = getDispatchRecords();
      expect(records).toEqual([]);
      expect(total).toBe(0);
    });

    it('添加一条记录后，可以查询到', () => {
      addDispatchRecord(makeRecord({ msgId: 'msg-001', msgType: 'FlowStatusChange' }));

      const { records, total } = getDispatchRecords();
      expect(total).toBe(1);
      expect(records).toHaveLength(1);
      expect(records[0].msgId).toBe('msg-001');
      expect(records[0].msgType).toBe('FlowStatusChange');
      expect(records[0].id).toBeDefined();
      expect(records[0].id).toMatch(/^d-/);
    });

    it('添加多条记录后，按时间倒序返回（最新在前）', () => {
      addDispatchRecord(makeRecord({ msgId: 'msg-first' }));
      addDispatchRecord(makeRecord({ msgId: 'msg-second' }));
      addDispatchRecord(makeRecord({ msgId: 'msg-third' }));

      const { records, total } = getDispatchRecords(10, 0);
      expect(total).toBe(3);
      expect(records).toHaveLength(3);
      // 最新的在前
      expect(records[0].msgId).toBe('msg-third');
      expect(records[1].msgId).toBe('msg-second');
      expect(records[2].msgId).toBe('msg-first');
    });

    it('每条记录自动生成唯一 ID', () => {
      addDispatchRecord(makeRecord());
      addDispatchRecord(makeRecord());
      addDispatchRecord(makeRecord());

      const { records } = getDispatchRecords();
      const ids = records.map((r) => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });
  });

  // ── 分页查询 ──

  describe('分页查询', () => {
    beforeEach(() => {
      for (let i = 0; i < 25; i++) {
        addDispatchRecord(makeRecord({ msgId: `msg-${String(i).padStart(3, '0')}` }));
      }
    });

    it('默认 limit=20, offset=0', () => {
      const { records, total } = getDispatchRecords();
      expect(total).toBe(25);
      expect(records).toHaveLength(20);
      // 最新的在前 (msg-024 是最后添加的)
      expect(records[0].msgId).toBe('msg-024');
    });

    it('自定义 limit 和 offset', () => {
      const { records, total } = getDispatchRecords(5, 0);
      expect(total).toBe(25);
      expect(records).toHaveLength(5);
      expect(records[0].msgId).toBe('msg-024');
      expect(records[4].msgId).toBe('msg-020');
    });

    it('offset 翻页', () => {
      const page1 = getDispatchRecords(5, 0);
      const page2 = getDispatchRecords(5, 5);
      expect(page1.records[0].msgId).toBe('msg-024');
      expect(page2.records[0].msgId).toBe('msg-019');
    });

    it('offset 超出范围返回空数组', () => {
      const { records, total } = getDispatchRecords(10, 100);
      expect(total).toBe(25);
      expect(records).toHaveLength(0);
    });

    it('limit 上限为 100', () => {
      // 添加足够多的记录
      clearDispatchRecords();
      for (let i = 0; i < 150; i++) {
        addDispatchRecord(makeRecord({ msgId: `bulk-${i}` }));
      }
      const { records } = getDispatchRecords(200, 0);
      expect(records.length).toBeLessThanOrEqual(100);
    });

    it('limit 最小为 1', () => {
      const { records } = getDispatchRecords(0, 0);
      expect(records).toHaveLength(1);
    });

    it('offset 负值安全处理为 0', () => {
      const { records } = getDispatchRecords(5, -10);
      expect(records).toHaveLength(5);
      expect(records[0].msgId).toBe('msg-024');
    });
  });

  // ── 环形缓冲区容量 ──

  describe('环形缓冲区容量（最多 500 条）', () => {
    it('超过 500 条后，旧记录被覆盖', () => {
      for (let i = 0; i < 510; i++) {
        addDispatchRecord(makeRecord({ msgId: `overflow-${i}` }));
      }

      const { total } = getDispatchRecords();
      expect(total).toBe(500); // 缓冲区最大 500

      // 最新的应是 overflow-509
      const { records } = getDispatchRecords(1, 0);
      expect(records[0].msgId).toBe('overflow-509');

      // 最旧的应是 overflow-10（前 10 条被覆盖了）
      const oldest = getDispatchRecords(1, 499);
      expect(oldest.records[0].msgId).toBe('overflow-10');
    });

    it('恰好 500 条时全部保留', () => {
      for (let i = 0; i < 500; i++) {
        addDispatchRecord(makeRecord({ msgId: `exact-${i}` }));
      }

      const { total } = getDispatchRecords();
      expect(total).toBe(500);

      const first = getDispatchRecords(1, 0);
      expect(first.records[0].msgId).toBe('exact-499');

      const last = getDispatchRecords(1, 499);
      expect(last.records[0].msgId).toBe('exact-0');
    });
  });

  // ── getDispatchStats ──

  describe('getDispatchStats 统计摘要', () => {
    it('空记录时统计全为 0', () => {
      const stats = getDispatchStats();
      expect(stats.totalDispatched).toBe(0);
      expect(stats.totalSuccess).toBe(0);
      expect(stats.totalFailed).toBe(0);
      expect(stats.recentFailures).toEqual([]);
      expect(stats.bufferUsage.used).toBe(0);
      expect(stats.bufferUsage.capacity).toBe(500);
    });

    it('成功记录的统计', () => {
      addDispatchRecord(makeRecord({ successCount: 3, failCount: 0 }));
      addDispatchRecord(makeRecord({ successCount: 2, failCount: 0 }));

      const stats = getDispatchStats();
      expect(stats.totalDispatched).toBe(2);
      expect(stats.totalSuccess).toBe(5);
      expect(stats.totalFailed).toBe(0);
      expect(stats.recentFailures).toHaveLength(0);
    });

    it('混合成功和失败的统计', () => {
      addDispatchRecord(makeRecord({ successCount: 2, failCount: 0 }));
      addDispatchRecord(makeFailedRecord({ successCount: 1, failCount: 1 }));
      addDispatchRecord(makeRecord({ successCount: 3, failCount: 0 }));
      addDispatchRecord(makeFailedRecord({ successCount: 0, failCount: 2 }));

      const stats = getDispatchStats();
      expect(stats.totalDispatched).toBe(4);
      expect(stats.totalSuccess).toBe(6);  // 2 + 1 + 3 + 0
      expect(stats.totalFailed).toBe(3);   // 0 + 1 + 0 + 2
      expect(stats.recentFailures).toHaveLength(2); // 2 条有 failCount > 0
    });

    it('系统级错误也出现在 recentFailures 中', () => {
      addDispatchRecord(makeRecord({
        successCount: 0,
        failCount: 0,
        error: 'Config load failed: ENOENT',
        results: [],
      }));

      const stats = getDispatchStats();
      expect(stats.recentFailures).toHaveLength(1);
      expect(stats.recentFailures[0].error).toContain('Config load failed');
    });

    it('recentFailures 最多 20 条', () => {
      for (let i = 0; i < 30; i++) {
        addDispatchRecord(makeFailedRecord({ msgId: `fail-${i}` }));
      }

      const stats = getDispatchStats();
      expect(stats.recentFailures.length).toBeLessThanOrEqual(20);
    });

    it('bufferUsage 正确反映当前使用量', () => {
      addDispatchRecord(makeRecord());
      addDispatchRecord(makeRecord());
      addDispatchRecord(makeRecord());

      const stats = getDispatchStats();
      expect(stats.bufferUsage.used).toBe(3);
      expect(stats.bufferUsage.capacity).toBe(500);
    });

    it('增量统计跨越缓冲区覆盖仍然准确（统计是累加的，不受缓冲区容量限制）', () => {
      for (let i = 0; i < 510; i++) {
        addDispatchRecord(makeRecord({ successCount: 1, failCount: 0 }));
      }

      const stats = getDispatchStats();
      expect(stats.totalDispatched).toBe(510); // 增量统计不受缓冲区大小限制
      expect(stats.totalSuccess).toBe(510);
      expect(stats.bufferUsage.used).toBe(500); // 缓冲区满
    });
  });

  // ── clearDispatchRecords ──

  describe('clearDispatchRecords', () => {
    it('清空后记录为空', () => {
      addDispatchRecord(makeRecord());
      addDispatchRecord(makeRecord());

      clearDispatchRecords();

      const { records, total } = getDispatchRecords();
      expect(records).toHaveLength(0);
      expect(total).toBe(0);
    });

    it('清空后统计全部重置', () => {
      addDispatchRecord(makeRecord({ successCount: 5, failCount: 2 }));
      clearDispatchRecords();

      const stats = getDispatchStats();
      expect(stats.totalDispatched).toBe(0);
      expect(stats.totalSuccess).toBe(0);
      expect(stats.totalFailed).toBe(0);
      expect(stats.recentFailures).toHaveLength(0);
      expect(stats.bufferUsage.used).toBe(0);
    });

    it('清空后可重新添加记录', () => {
      addDispatchRecord(makeRecord({ msgId: 'before-clear' }));
      clearDispatchRecords();
      addDispatchRecord(makeRecord({ msgId: 'after-clear' }));

      const { records, total } = getDispatchRecords();
      expect(total).toBe(1);
      expect(records[0].msgId).toBe('after-clear');
    });
  });

  // ── 记录字段完整性 ──

  describe('记录字段完整性', () => {
    it('记录包含所有必要字段', () => {
      addDispatchRecord(makeRecord({
        msgId: 'field-test',
        msgType: 'OperateSeal',
        totalTargets: 3,
        matchedTargets: 2,
        successCount: 1,
        failCount: 1,
      }));

      const { records } = getDispatchRecords(1);
      const record = records[0];

      expect(record.id).toBeDefined();
      expect(record.msgId).toBe('field-test');
      expect(record.msgType).toBe('OperateSeal');
      expect(record.receivedAt).toBeDefined();
      expect(record.totalTargets).toBe(3);
      expect(record.matchedTargets).toBe(2);
      expect(record.successCount).toBe(1);
      expect(record.failCount).toBe(1);
      expect(record.results).toBeDefined();
      expect(Array.isArray(record.results)).toBe(true);
    });

    it('result 子项包含完整分发结果', () => {
      addDispatchRecord(makeFailedRecord());

      const { records } = getDispatchRecords(1);
      const results = records[0].results;

      // 成功的 result
      const successResult = results.find((r) => r.success);
      expect(successResult).toBeDefined();
      expect(successResult!.configId).toBeDefined();
      expect(successResult!.configName).toBeDefined();
      expect(successResult!.url).toBeDefined();
      expect(successResult!.statusCode).toBe(200);
      expect(successResult!.retryCount).toBe(0);

      // 失败的 result
      const failResult = results.find((r) => !r.success);
      expect(failResult).toBeDefined();
      expect(failResult!.error).toBeDefined();
      expect(failResult!.errorType).toBe('server_error');
      expect(failResult!.retryCount).toBe(3);
    });

    it('可选的 error 字段（系统级错误）', () => {
      addDispatchRecord(makeRecord({
        error: 'Config load failed: connection refused',
        results: [],
      }));

      const { records } = getDispatchRecords(1);
      expect(records[0].error).toBe('Config load failed: connection refused');
    });
  });

  // ── 边界场景 ──

  describe('边界场景', () => {
    it('0 个目标的分发记录', () => {
      addDispatchRecord(makeRecord({
        totalTargets: 0,
        matchedTargets: 0,
        successCount: 0,
        failCount: 0,
        results: [],
      }));

      const { records } = getDispatchRecords(1);
      expect(records[0].totalTargets).toBe(0);
      expect(records[0].results).toHaveLength(0);
    });

    it('高频写入不会导致异常', () => {
      // 模拟高频写入
      expect(() => {
        for (let i = 0; i < 1000; i++) {
          addDispatchRecord(makeRecord({ msgId: `high-freq-${i}` }));
        }
      }).not.toThrow();

      const { total } = getDispatchRecords();
      expect(total).toBe(500); // 受缓冲区限制
    });

    it('各种 msgType 都能正常记录', () => {
      const msgTypes = [
        'FlowStatusChange', 'OperateSeal', 'TemplateAdd',
        'VerifyStaffInfo', 'BillingUse', 'FlowCost',
      ];

      for (const msgType of msgTypes) {
        addDispatchRecord(makeRecord({ msgType }));
      }

      const { records } = getDispatchRecords(10);
      const types = records.map((r) => r.msgType);
      for (const msgType of msgTypes) {
        expect(types).toContain(msgType);
      }
    });
  });
});
