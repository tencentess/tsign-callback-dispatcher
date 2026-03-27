import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createMockReceiver, MockReceiver } from '../helpers/mock-receiver';
import {
  createTempConfigDir,
  startDispatcher,
  stopDispatcher,
  cleanupDir,
  sendCallback,
  waitMs,
  DispatcherInstance,
} from '../helpers/test-utils';
import { buildEncryptedCallback, buildMockMessage } from '../helpers/crypto-helpers';
import { generateEncryptKey, generateSignToken } from '../../src/utils/crypto.util';

// 使用动态端口分配避免端口冲突
const DISPATCHER_PORT = 18901;
const RECEIVER_PORT = 18902;
const FAIL_RECEIVER_PORT = 18903; // 不启动，模拟连接拒绝

const ENCRYPT_KEY = generateEncryptKey();
const TOKEN = generateSignToken();

let dispatcher: DispatcherInstance;
let receiver: MockReceiver;
let configDir: string;

describe('集成测试: 分发记录（dispatch-history）API', () => {
  beforeAll(async () => {
    configDir = createTempConfigDir({
      port: DISPATCHER_PORT,
      encryptKey: ENCRYPT_KEY,
      token: TOKEN,
      callbacks: [],
    });

    receiver = createMockReceiver(RECEIVER_PORT);
    await receiver.start();

    dispatcher = await startDispatcher(
      { port: DISPATCHER_PORT, encryptKey: ENCRYPT_KEY, token: TOKEN },
      configDir
    );
  }, 60000);

  afterAll(async () => {
    await stopDispatcher(dispatcher);
    await receiver.stop();
    cleanupDir(configDir);
  }, 15000);

  afterEach(async () => {
    receiver.clearReceived();
    // 清理所有 callback 配置
    const res = await dispatcher.api.get('/callbacks');
    const allCallbacks = res.data?.data || [];
    for (const cb of allCallbacks) {
      await dispatcher.api.delete(`/callbacks/${cb.id}`).catch(() => {});
    }
  });

  // ── 辅助函数 ──

  async function createCallbackConfig(overrides: Record<string, any> = {}) {
    const res = await dispatcher.api.post('/callbacks', {
      name: `test-${Date.now()}`,
      url: `${receiver.url}/callback`,
      appType: 'company',
      tags: [],
      matchRules: [],
      enabled: true,
      retryCount: 0,
      timeout: 5000,
      msgTypes: [],
      unknownMsgTypePolicy: 'dispatch',
      ...overrides,
    });
    return res.data.data;
  }

  function sendMsg(msgType: string, msgData: Record<string, any> = {}) {
    const msg = buildMockMessage(msgType, msgData);
    const req = buildEncryptedCallback(msg, ENCRYPT_KEY, TOKEN);
    return sendCallback(DISPATCHER_PORT, req.body, req.query);
  }

  // ── 1. dispatch-history API 基础验证 ──

  describe('1. dispatch-history API', () => {
    it('初始状态返回空记录列表', async () => {
      const res = await dispatcher.api.get('/dispatch-history');

      expect(res.status).toBe(200);
      expect(res.data.code).toBe(0);
      expect(res.data.data).toBeDefined();
      expect(res.data.data.records).toBeDefined();
      expect(Array.isArray(res.data.data.records)).toBe(true);
      expect(res.data.data.total).toBeGreaterThanOrEqual(0);
    });

    it('发送回调后，产生分发记录', async () => {
      await createCallbackConfig();

      await sendMsg('FlowStatusChange', { FlowId: 'history-test-1' });
      await waitMs(2000);

      const res = await dispatcher.api.get('/dispatch-history');
      const { records, total } = res.data.data;

      expect(total).toBeGreaterThanOrEqual(1);
      expect(records.length).toBeGreaterThanOrEqual(1);

      // 验证记录结构
      const latest = records[0];
      expect(latest.id).toBeDefined();
      expect(latest.msgType).toBe('FlowStatusChange');
      expect(latest.receivedAt).toBeDefined();
      expect(latest.totalTargets).toBeGreaterThanOrEqual(1);
      expect(latest.results).toBeDefined();
      expect(Array.isArray(latest.results)).toBe(true);
    });

    it('成功分发的记录 successCount > 0', async () => {
      await createCallbackConfig();

      await sendMsg('FlowStatusChange', { FlowId: 'success-test' });
      await waitMs(2000);

      const res = await dispatcher.api.get('/dispatch-history?limit=1');
      const latest = res.data.data.records[0];

      expect(latest.successCount).toBeGreaterThanOrEqual(1);
      expect(latest.failCount).toBe(0);
      expect(latest.results[0].success).toBe(true);
      expect(latest.results[0].statusCode).toBe(200);
    });

    it('分发到不可达地址的记录 failCount > 0', async () => {
      // 创建一个指向不存在服务的回调配置
      await createCallbackConfig({
        url: `http://localhost:${FAIL_RECEIVER_PORT}/callback`,
        retryCount: 0,
        timeout: 2000,
      });

      await sendMsg('FlowStatusChange', { FlowId: 'fail-test' });
      await waitMs(3000);

      const res = await dispatcher.api.get('/dispatch-history?limit=1');
      const latest = res.data.data.records[0];

      expect(latest.failCount).toBeGreaterThanOrEqual(1);
      expect(latest.results.some((r: any) => !r.success)).toBe(true);
    });
  });

  // ── 2. 分页查询 ──

  describe('2. 分页查询', () => {
    it('limit 和 offset 参数生效', async () => {
      await createCallbackConfig();

      // 发送多条消息
      for (let i = 0; i < 5; i++) {
        await sendMsg('FlowStatusChange', { FlowId: `page-test-${i}` });
        await waitMs(300);
      }
      await waitMs(2000);

      // 取第 1 页，每页 2 条
      const page1 = await dispatcher.api.get('/dispatch-history?limit=2&offset=0');
      expect(page1.data.data.records.length).toBeLessThanOrEqual(2);

      // 取第 2 页
      const page2 = await dispatcher.api.get('/dispatch-history?limit=2&offset=2');
      expect(page2.data.data.records.length).toBeLessThanOrEqual(2);

      // 两页记录不重复（比较 id）
      const page1Ids = page1.data.data.records.map((r: any) => r.id);
      const page2Ids = page2.data.data.records.map((r: any) => r.id);
      const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
      expect(overlap).toHaveLength(0);
    });

    it('limit 上限为 100', async () => {
      const res = await dispatcher.api.get('/dispatch-history?limit=999');
      expect(res.data.data.limit).toBeLessThanOrEqual(100);
    });

    it('返回 limit 和 offset 供前端参考', async () => {
      const res = await dispatcher.api.get('/dispatch-history?limit=10&offset=5');
      expect(res.data.data.limit).toBe(10);
      expect(res.data.data.offset).toBe(5);
    });
  });

  // ── 3. dispatch-stats API ──

  describe('3. dispatch-stats API', () => {
    it('返回统计摘要结构', async () => {
      const res = await dispatcher.api.get('/dispatch-stats');

      expect(res.status).toBe(200);
      expect(res.data.code).toBe(0);
      expect(res.data.data).toBeDefined();

      const stats = res.data.data;
      expect(typeof stats.totalDispatched).toBe('number');
      expect(typeof stats.totalSuccess).toBe('number');
      expect(typeof stats.totalFailed).toBe('number');
      expect(Array.isArray(stats.recentFailures)).toBe(true);
      expect(stats.bufferUsage).toBeDefined();
      expect(typeof stats.bufferUsage.used).toBe('number');
      expect(typeof stats.bufferUsage.capacity).toBe('number');
    });

    it('成功分发后统计递增', async () => {
      const before = await dispatcher.api.get('/dispatch-stats');
      const beforeTotal = before.data.data.totalDispatched;
      const beforeSuccess = before.data.data.totalSuccess;

      await createCallbackConfig();
      await sendMsg('FlowStatusChange', { FlowId: 'stats-test' });
      await waitMs(2000);

      const after = await dispatcher.api.get('/dispatch-stats');
      expect(after.data.data.totalDispatched).toBeGreaterThan(beforeTotal);
      expect(after.data.data.totalSuccess).toBeGreaterThan(beforeSuccess);
    });

    it('失败分发后 totalFailed 递增', async () => {
      const before = await dispatcher.api.get('/dispatch-stats');
      const beforeFailed = before.data.data.totalFailed;

      // 指向不可达地址
      await createCallbackConfig({
        url: `http://localhost:${FAIL_RECEIVER_PORT}/callback`,
        retryCount: 0,
        timeout: 2000,
      });
      await sendMsg('FlowStatusChange', { FlowId: 'stats-fail-test' });
      await waitMs(3000);

      const after = await dispatcher.api.get('/dispatch-stats');
      expect(after.data.data.totalFailed).toBeGreaterThan(beforeFailed);
    });

    it('失败分发出现在 recentFailures 列表中', async () => {
      await createCallbackConfig({
        url: `http://localhost:${FAIL_RECEIVER_PORT}/callback`,
        retryCount: 0,
        timeout: 2000,
      });
      await sendMsg('FlowStatusChange', { FlowId: 'recent-fail-test' });
      await waitMs(3000);

      const res = await dispatcher.api.get('/dispatch-stats');
      const failures = res.data.data.recentFailures;

      expect(failures.length).toBeGreaterThanOrEqual(1);
      // 至少一条记录的 failCount > 0
      expect(failures.some((f: any) => f.failCount > 0)).toBe(true);
    });

    it('bufferUsage.capacity 为 500', async () => {
      const res = await dispatcher.api.get('/dispatch-stats');
      expect(res.data.data.bufferUsage.capacity).toBe(500);
    });
  });

  // ── 4. 无目标时也产生记录 ──

  describe('4. 无目标时的记录', () => {
    it('没有任何回调配置时，发送消息仍产生分发记录', async () => {
      const before = await dispatcher.api.get('/dispatch-stats');
      const beforeTotal = before.data.data.totalDispatched;

      await sendMsg('FlowStatusChange', { FlowId: 'no-target-test' });
      await waitMs(2000);

      const after = await dispatcher.api.get('/dispatch-stats');
      expect(after.data.data.totalDispatched).toBeGreaterThan(beforeTotal);

      // 查看最新记录
      const historyRes = await dispatcher.api.get('/dispatch-history?limit=1');
      const latest = historyRes.data.data.records[0];
      expect(latest.matchedTargets).toBe(0);
      expect(latest.results).toHaveLength(0);
    });
  });

  // ── 5. 多目标混合结果 ──

  describe('5. 多目标混合结果', () => {
    it('同时有成功和失败的目标，记录完整反映', async () => {
      // 一个可达，一个不可达
      await createCallbackConfig({ name: '可达目标' });
      await createCallbackConfig({
        name: '不可达目标',
        url: `http://localhost:${FAIL_RECEIVER_PORT}/callback`,
        retryCount: 0,
        timeout: 2000,
      });

      await sendMsg('FlowStatusChange', { FlowId: 'mixed-test' });
      await waitMs(3000);

      const res = await dispatcher.api.get('/dispatch-history?limit=1');
      const latest = res.data.data.records[0];

      // 应该有至少 2 个 result
      expect(latest.results.length).toBeGreaterThanOrEqual(2);
      expect(latest.successCount).toBeGreaterThanOrEqual(1);
      expect(latest.failCount).toBeGreaterThanOrEqual(1);

      // 成功和失败的 result 都有
      const successResults = latest.results.filter((r: any) => r.success);
      const failResults = latest.results.filter((r: any) => !r.success);
      expect(successResults.length).toBeGreaterThanOrEqual(1);
      expect(failResults.length).toBeGreaterThanOrEqual(1);

      // 失败 result 包含错误信息
      expect(failResults[0].error).toBeDefined();
    });
  });

  // ── 6. 分发记录的 result 子项完整性 ──

  describe('6. result 子项字段完整性', () => {
    it('成功的 result 包含必要字段', async () => {
      await createCallbackConfig({ name: '字段测试目标' });

      await sendMsg('FlowStatusChange', { FlowId: 'result-fields-test' });
      await waitMs(2000);

      const res = await dispatcher.api.get('/dispatch-history?limit=1');
      const result = res.data.data.records[0].results[0];

      expect(result.configId).toBeDefined();
      expect(result.configName).toBe('字段测试目标');
      expect(result.url).toContain(`localhost:${RECEIVER_PORT}`);
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(typeof result.retryCount).toBe('number');
      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThan(0);
    });
  });

  // ── 7. 认证保护 ──

  describe('7. API 认证保护', () => {
    it('未认证请求 dispatch-history 返回 401', async () => {
      try {
        const axios = (await import('axios')).default;
        await axios.get(`http://localhost:${DISPATCHER_PORT}/api/dispatch-history`, { timeout: 3000 });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.response.status).toBe(401);
      }
    });

    it('未认证请求 dispatch-stats 返回 401', async () => {
      try {
        const axios = (await import('axios')).default;
        await axios.get(`http://localhost:${DISPATCHER_PORT}/api/dispatch-stats`, { timeout: 3000 });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.response.status).toBe(401);
      }
    });
  });
});
