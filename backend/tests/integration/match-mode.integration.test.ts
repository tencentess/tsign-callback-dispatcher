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

const DISPATCHER_PORT = 29701;
const RECEIVER_A_PORT = 29702;
const RECEIVER_B_PORT = 29703;

const ENCRYPT_KEY = generateEncryptKey();
const TOKEN = generateSignToken();

let dispatcher: DispatcherInstance;
let receiverA: MockReceiver;
let receiverB: MockReceiver;
let configDir: string;

describe('集成测试: matchMode 前缀匹配分发', () => {
  beforeAll(async () => {
    configDir = createTempConfigDir({
      port: DISPATCHER_PORT,
      encryptKey: ENCRYPT_KEY,
      token: TOKEN,
      callbacks: [],
    });

    receiverA = createMockReceiver(RECEIVER_A_PORT);
    receiverB = createMockReceiver(RECEIVER_B_PORT);
    await receiverA.start();
    await receiverB.start();

    dispatcher = await startDispatcher(
      { port: DISPATCHER_PORT, encryptKey: ENCRYPT_KEY, token: TOKEN },
      configDir
    );
  }, 60000);

  afterAll(async () => {
    await stopDispatcher(dispatcher);
    await receiverA.stop();
    await receiverB.stop();
    cleanupDir(configDir);
  }, 15000);

  afterEach(async () => {
    receiverA.clearReceived();
    receiverB.clearReceived();
    // 清理所有 callback 配置
    const res = await dispatcher.api.get('/callbacks');
    const allCallbacks = res.data?.data || [];
    for (const cb of allCallbacks) {
      await dispatcher.api.delete(`/callbacks/${cb.id}`).catch(() => {});
    }
  });

  // ── 辅助函数 ──

  async function createCallbackConfig(receiverUrl: string, overrides: Record<string, any> = {}) {
    const res = await dispatcher.api.post('/callbacks', {
      name: `test-${Date.now()}`,
      url: `${receiverUrl}/callback`,
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

  // ── 1. 基本前缀匹配分发 ──

  describe('1. 前缀匹配基本功能', () => {
    it('FlowType 前缀匹配：消息值以配置值开头 → 分发', async () => {
      await createCallbackConfig(receiverA.url, {
        tags: [{ key: 'FlowType', value: 'purchase', matchMode: 'prefix' }],
      });

      await sendMsg('FlowStatusChange', { FlowType: 'purchase-order-001' });
      const received = await receiverA.waitForRequests(1, 5000);
      expect(received.length).toBeGreaterThanOrEqual(1);
    });

    it('FlowType 前缀匹配：消息值完全等于配置值 → 分发', async () => {
      await createCallbackConfig(receiverA.url, {
        tags: [{ key: 'FlowType', value: 'purchase', matchMode: 'prefix' }],
      });

      await sendMsg('FlowStatusChange', { FlowType: 'purchase' });
      const received = await receiverA.waitForRequests(1, 5000);
      expect(received.length).toBeGreaterThanOrEqual(1);
    });

    it('FlowType 前缀匹配：消息值不以配置值开头 → 不分发', async () => {
      await createCallbackConfig(receiverA.url, {
        tags: [{ key: 'FlowType', value: 'purchase', matchMode: 'prefix' }],
      });

      await sendMsg('FlowStatusChange', { FlowType: 'hr-contract-001' });
      await waitMs(1500);
      expect(receiverA.getReceived().length).toBe(0);
    });
  });

  // ── 2. 精确匹配 vs 前缀匹配对比 ──

  describe('2. 精确匹配 vs 前缀匹配', () => {
    it('相同的值：exact 不通过、prefix 通过', async () => {
      // receiverA: exact 匹配
      await createCallbackConfig(receiverA.url, {
        tags: [{ key: 'FlowType', value: 'purchase', matchMode: 'exact' }],
      });
      // receiverB: prefix 匹配
      await createCallbackConfig(receiverB.url, {
        tags: [{ key: 'FlowType', value: 'purchase', matchMode: 'prefix' }],
      });

      // 发送值为 "purchase-order" 的消息
      await sendMsg('FlowStatusChange', { FlowType: 'purchase-order' });
      await waitMs(2000);

      // exact 匹配的 receiverA 不应收到
      expect(receiverA.getReceived().length).toBe(0);
      // prefix 匹配的 receiverB 应收到
      expect(receiverB.getReceived().length).toBeGreaterThanOrEqual(1);
    });

    it('完全相等的值：exact 和 prefix 都通过', async () => {
      await createCallbackConfig(receiverA.url, {
        tags: [{ key: 'FlowType', value: 'purchase', matchMode: 'exact' }],
      });
      await createCallbackConfig(receiverB.url, {
        tags: [{ key: 'FlowType', value: 'purchase', matchMode: 'prefix' }],
      });

      await sendMsg('FlowStatusChange', { FlowType: 'purchase' });
      await waitMs(2000);

      expect(receiverA.getReceived().length).toBeGreaterThanOrEqual(1);
      expect(receiverB.getReceived().length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 3. UserData 前缀匹配 ──

  describe('3. UserData 前缀匹配', () => {
    it('UserData 前缀匹配：匹配前缀 → 分发', async () => {
      await createCallbackConfig(receiverA.url, {
        tags: [{ key: 'UserData', value: 'dept-finance', matchMode: 'prefix' }],
      });

      await sendMsg('FlowStatusChange', { UserData: 'dept-finance-team-a' });
      const received = await receiverA.waitForRequests(1, 5000);
      expect(received.length).toBeGreaterThanOrEqual(1);
    });

    it('UserData 前缀匹配：不匹配 → 不分发', async () => {
      await createCallbackConfig(receiverA.url, {
        tags: [{ key: 'UserData', value: 'dept-finance', matchMode: 'prefix' }],
      });

      await sendMsg('FlowStatusChange', { UserData: 'dept-hr-team-b' });
      await waitMs(1500);
      expect(receiverA.getReceived().length).toBe(0);
    });
  });

  // ── 4. 多标签混合 matchMode ──

  describe('4. 多标签混合匹配模式', () => {
    it('FlowType 前缀匹配 + UserData 精确匹配 - 两者都通过 → 分发', async () => {
      await createCallbackConfig(receiverA.url, {
        tags: [
          { key: 'FlowType', value: 'purchase', matchMode: 'prefix' },
          { key: 'UserData', value: 'dept-finance', matchMode: 'exact' },
        ],
      });

      await sendMsg('FlowStatusChange', { FlowType: 'purchase-order', UserData: 'dept-finance' });
      const received = await receiverA.waitForRequests(1, 5000);
      expect(received.length).toBeGreaterThanOrEqual(1);
    });

    it('FlowType 前缀匹配通过 + UserData 精确匹配不通过 → 不分发', async () => {
      await createCallbackConfig(receiverA.url, {
        tags: [
          { key: 'FlowType', value: 'purchase', matchMode: 'prefix' },
          { key: 'UserData', value: 'dept-finance', matchMode: 'exact' },
        ],
      });

      await sendMsg('FlowStatusChange', { FlowType: 'purchase-order', UserData: 'dept-hr' });
      await waitMs(1500);
      expect(receiverA.getReceived().length).toBe(0);
    });
  });

  // ── 5. 前缀匹配 + 字段缺失策略 ──

  describe('5. 前缀匹配 + 字段缺失策略', () => {
    it('前缀匹配 + 字段不存在 + 默认 dispatch → 分发', async () => {
      await createCallbackConfig(receiverA.url, {
        tags: [{ key: 'FlowType', value: 'purchase', matchMode: 'prefix' }],
      });

      // 发送非合同消息（无 FlowType 字段）
      await sendMsg('OperateSeal', { SealId: 'seal-001' });
      const received = await receiverA.waitForRequests(1, 5000);
      expect(received.length).toBeGreaterThanOrEqual(1);
    });

    it('前缀匹配 + 字段不存在 + discard → 不分发', async () => {
      await createCallbackConfig(receiverA.url, {
        tags: [{ key: 'FlowType', value: 'purchase', matchMode: 'prefix' }],
        builtInTagMissPolicy: 'discard',
      });

      await sendMsg('OperateSeal', { SealId: 'seal-001' });
      await waitMs(1500);
      expect(receiverA.getReceived().length).toBe(0);
    });
  });

  // ── 6. matchMode 配置持久化验证 ──

  describe('6. matchMode 配置 API 持久化', () => {
    it('创建带 matchMode 的配置后，读取回来 matchMode 正确', async () => {
      const config = await createCallbackConfig(receiverA.url, {
        tags: [
          { key: 'FlowType', value: 'purchase', matchMode: 'prefix' },
          { key: 'UserData', value: 'dept-a', matchMode: 'exact' },
        ],
      });

      // 读取配置
      const res = await dispatcher.api.get(`/callbacks/${config.id}`);
      const savedConfig = res.data.data;

      expect(savedConfig.tags).toHaveLength(2);

      const flowTypeTag = savedConfig.tags.find((t: any) => t.key === 'FlowType');
      expect(flowTypeTag.matchMode).toBe('prefix');

      const userDataTag = savedConfig.tags.find((t: any) => t.key === 'UserData');
      expect(userDataTag.matchMode).toBe('exact');
    });

    it('更新 matchMode 后分发行为随之变化', async () => {
      // 创建配置：exact 匹配
      const config = await createCallbackConfig(receiverA.url, {
        tags: [{ key: 'FlowType', value: 'purchase', matchMode: 'exact' }],
      });

      // 发送前缀值的消息 → exact 模式下不分发
      await sendMsg('FlowStatusChange', { FlowType: 'purchase-order' });
      await waitMs(1500);
      expect(receiverA.getReceived().length).toBe(0);

      // 更新为 prefix 匹配
      await dispatcher.api.put(`/callbacks/${config.id}`, {
        tags: [{ key: 'FlowType', value: 'purchase', matchMode: 'prefix' }],
      });
      await waitMs(300);

      // 相同消息 → prefix 模式下分发
      await sendMsg('FlowStatusChange', { FlowType: 'purchase-order' });
      const received = await receiverA.waitForRequests(1, 5000);
      expect(received.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 7. 多下游不同 matchMode ──

  describe('7. 多下游不同匹配模式', () => {
    it('receiverA 精确匹配 + receiverB 前缀匹配 → 只有 B 收到', async () => {
      await createCallbackConfig(receiverA.url, {
        tags: [{ key: 'FlowType', value: 'purchase', matchMode: 'exact' }],
      });
      await createCallbackConfig(receiverB.url, {
        tags: [{ key: 'FlowType', value: 'purchase', matchMode: 'prefix' }],
      });

      // 发送 "purchase-special" → exact 不匹配，prefix 匹配
      await sendMsg('FlowStatusChange', { FlowType: 'purchase-special' });
      await waitMs(2000);

      expect(receiverA.getReceived().length).toBe(0);
      expect(receiverB.getReceived().length).toBeGreaterThanOrEqual(1);
    });

    it('receiverA 前缀匹配 "purchase" + receiverB 前缀匹配 "hr" → 各自只收到匹配消息', async () => {
      await createCallbackConfig(receiverA.url, {
        tags: [{ key: 'FlowType', value: 'purchase', matchMode: 'prefix' }],
      });
      await createCallbackConfig(receiverB.url, {
        tags: [{ key: 'FlowType', value: 'hr', matchMode: 'prefix' }],
      });

      // 发送 purchase 前缀的消息
      await sendMsg('FlowStatusChange', { FlowType: 'purchase-order-001' });
      await waitMs(1500);

      expect(receiverA.getReceived().length).toBeGreaterThanOrEqual(1);
      expect(receiverB.getReceived().length).toBe(0);

      receiverA.clearReceived();

      // 发送 hr 前缀的消息
      await sendMsg('FlowStatusChange', { FlowType: 'hr-contract-001' });
      await waitMs(1500);

      expect(receiverA.getReceived().length).toBe(0);
      expect(receiverB.getReceived().length).toBeGreaterThanOrEqual(1);
    });
  });
});
