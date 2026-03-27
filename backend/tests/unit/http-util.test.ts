import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import express from 'express';
import http from 'http';
import { httpPostWithRetry, HttpPostResult } from '../../src/utils/http.util';

// Mock logger to suppress output
vi.mock('../../src/services/logger.service', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ── 测试用 HTTP 服务器 ──

const TEST_PORT = 19876;
let server: http.Server;
let requestLog: Array<{ body: any; headers: Record<string, string>; count: number }> = [];
let requestCount = 0;
let responseHandler: (req: express.Request, res: express.Response) => void = (_req, res) =>
  res.status(200).json({ ok: true });

function setHandler(handler: (req: express.Request, res: express.Response) => void) {
  responseHandler = handler;
}

beforeAll(() => {
  return new Promise<void>((resolve) => {
    const app = express();
    app.use(express.json());
    app.post('*', (req, res) => {
      requestCount++;
      requestLog.push({
        body: req.body,
        headers: req.headers as Record<string, string>,
        count: requestCount,
      });
      responseHandler(req, res);
    });
    server = app.listen(TEST_PORT, () => resolve());
  });
});

afterAll(() => {
  return new Promise<void>((resolve) => {
    if (server) server.close(() => resolve());
    else resolve();
  });
});

afterEach(() => {
  requestLog = [];
  requestCount = 0;
  responseHandler = (_req, res) => res.status(200).json({ ok: true });
});

const BASE_URL = `http://localhost:${TEST_PORT}`;

// =====================================================
// 测试开始
// =====================================================

describe('httpPostWithRetry', () => {
  // ── 基础成功场景 ──

  describe('成功请求', () => {
    it('正常 200 响应', async () => {
      setHandler((_req, res) => res.status(200).json({ code: 0, message: 'success' }));

      const result = await httpPostWithRetry({
        url: `${BASE_URL}/callback`,
        data: { test: true },
        retryCount: 0,
      });

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.retryCount).toBe(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
    });

    it('201 响应也视为成功', async () => {
      setHandler((_req, res) => res.status(201).json({ created: true }));

      const result = await httpPostWithRetry({
        url: `${BASE_URL}/callback`,
        data: { test: true },
        retryCount: 0,
      });

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(201);
    });

    it('请求体正确传递', async () => {
      const testData = { MsgType: 'FlowStatusChange', MsgId: 'test-001' };
      setHandler((_req, res) => res.status(200).json({ ok: true }));

      await httpPostWithRetry({
        url: `${BASE_URL}/callback`,
        data: testData,
        retryCount: 0,
      });

      expect(requestLog).toHaveLength(1);
      expect(requestLog[0].body).toEqual(testData);
    });

    it('自定义 headers 正确传递', async () => {
      setHandler((_req, res) => res.status(200).json({ ok: true }));

      await httpPostWithRetry({
        url: `${BASE_URL}/callback`,
        data: {},
        headers: { 'X-Custom-Header': 'test-value' },
        retryCount: 0,
      });

      expect(requestLog[0].headers['x-custom-header']).toBe('test-value');
    });

    it('query params 正确传递', async () => {
      let receivedQuery: Record<string, any> = {};
      const app2 = express();
      app2.use(express.json());
      const port2 = 19877;
      let server2: http.Server;

      await new Promise<void>((resolve) => {
        app2.post('*', (req, res) => {
          receivedQuery = req.query;
          res.status(200).json({ ok: true });
        });
        server2 = app2.listen(port2, () => resolve());
      });

      try {
        await httpPostWithRetry({
          url: `http://localhost:${port2}/callback`,
          data: {},
          params: { timestamp: '12345', nonce: 'abc', msg_signature: 'sig' },
          retryCount: 0,
        });

        expect(receivedQuery.timestamp).toBe('12345');
        expect(receivedQuery.nonce).toBe('abc');
        expect(receivedQuery.msg_signature).toBe('sig');
      } finally {
        await new Promise<void>((r) => server2.close(() => r()));
      }
    });

    it('responseBody 包含截取的响应摘要', async () => {
      setHandler((_req, res) => res.status(200).json({ code: 0, message: 'all good' }));

      const result = await httpPostWithRetry({
        url: `${BASE_URL}/callback`,
        data: {},
        retryCount: 0,
      });

      expect(result.responseBody).toBeDefined();
      expect(result.responseBody).toContain('all good');
    });
  });

  // ── 重试行为 ──

  describe('重试行为', () => {
    it('500 错误触发重试', async () => {
      let attempt = 0;
      setHandler((_req, res) => {
        attempt++;
        if (attempt <= 2) {
          res.status(500).json({ error: 'Internal Server Error' });
        } else {
          res.status(200).json({ ok: true });
        }
      });

      const result = await httpPostWithRetry({
        url: `${BASE_URL}/callback`,
        data: {},
        retryCount: 3,
        retryDelay: 50, // 加速测试
      });

      expect(result.success).toBe(true);
      expect(result.retryCount).toBe(2); // 第 3 次（index=2）成功
      expect(requestLog.length).toBe(3);
    });

    it('所有重试都失败时返回失败结果', async () => {
      setHandler((_req, res) => res.status(502).json({ error: 'Bad Gateway' }));

      const result = await httpPostWithRetry({
        url: `${BASE_URL}/callback`,
        data: {},
        retryCount: 2,
        retryDelay: 50,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('502');
      expect(requestLog.length).toBe(3); // 1 初始 + 2 重试
    });

    it('retryCount=0 时不重试', async () => {
      setHandler((_req, res) => res.status(500).json({ error: 'fail' }));

      const result = await httpPostWithRetry({
        url: `${BASE_URL}/callback`,
        data: {},
        retryCount: 0,
        retryDelay: 50,
      });

      expect(result.success).toBe(false);
      expect(requestLog.length).toBe(1);
    });
  });

  // ── Non-retryable 错误 ──

  describe('Non-retryable 错误（不重试）', () => {
    it('400 Bad Request 不重试', async () => {
      setHandler((_req, res) => res.status(400).json({ error: 'Bad Request' }));

      const result = await httpPostWithRetry({
        url: `${BASE_URL}/callback`,
        data: {},
        retryCount: 3,
        retryDelay: 50,
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.errorType).toBe('client_error');
      expect(requestLog.length).toBe(1); // 不重试
    });

    it('401 Unauthorized 不重试', async () => {
      setHandler((_req, res) => res.status(401).json({ error: 'Unauthorized' }));

      const result = await httpPostWithRetry({
        url: `${BASE_URL}/callback`,
        data: {},
        retryCount: 3,
        retryDelay: 50,
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(requestLog.length).toBe(1);
    });

    it('403 Forbidden 不重试', async () => {
      setHandler((_req, res) => res.status(403).json({ error: 'Forbidden' }));

      const result = await httpPostWithRetry({
        url: `${BASE_URL}/callback`,
        data: {},
        retryCount: 3,
        retryDelay: 50,
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(403);
      expect(requestLog.length).toBe(1);
    });

    it('404 Not Found 不重试', async () => {
      setHandler((_req, res) => res.status(404).json({ error: 'Not Found' }));

      const result = await httpPostWithRetry({
        url: `${BASE_URL}/callback`,
        data: {},
        retryCount: 3,
        retryDelay: 50,
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(404);
      expect(requestLog.length).toBe(1);
    });

    it('DNS 解析失败不重试', async () => {
      const result = await httpPostWithRetry({
        url: 'http://this-host-does-not-exist-abc123.invalid/callback',
        data: {},
        retryCount: 3,
        retryDelay: 50,
        timeout: 3000,
      });

      expect(result.success).toBe(false);
      expect(result.errorType).toBe('dns');
      expect(result.retryCount).toBe(0); // 不重试
    });
  });

  // ── 特殊可重试的 4xx ──

  describe('特殊可重试的 4xx', () => {
    it('408 Request Timeout 会重试', async () => {
      let attempt = 0;
      setHandler((_req, res) => {
        attempt++;
        if (attempt === 1) {
          res.status(408).json({ error: 'Request Timeout' });
        } else {
          res.status(200).json({ ok: true });
        }
      });

      const result = await httpPostWithRetry({
        url: `${BASE_URL}/callback`,
        data: {},
        retryCount: 2,
        retryDelay: 50,
      });

      expect(result.success).toBe(true);
      expect(requestLog.length).toBe(2);
    });

    it('429 Too Many Requests 会重试', async () => {
      let attempt = 0;
      setHandler((_req, res) => {
        attempt++;
        if (attempt === 1) {
          res.status(429).json({ error: 'Too Many Requests' });
        } else {
          res.status(200).json({ ok: true });
        }
      });

      const result = await httpPostWithRetry({
        url: `${BASE_URL}/callback`,
        data: {},
        retryCount: 2,
        retryDelay: 50,
      });

      expect(result.success).toBe(true);
      expect(requestLog.length).toBe(2);
    });
  });

  // ── 超时处理 ──

  describe('超时处理', () => {
    it('请求超时被正确分类', async () => {
      setHandler((_req, _res) => {
        // 不响应，让请求超时
      });

      const result = await httpPostWithRetry({
        url: `${BASE_URL}/callback`,
        data: {},
        timeout: 500,
        retryCount: 0,
      });

      expect(result.success).toBe(false);
      expect(result.errorType).toBe('timeout');
    });
  });

  // ── 连接拒绝 ──

  describe('连接错误', () => {
    it('连接拒绝 (ECONNREFUSED) 被正确分类并重试', async () => {
      const result = await httpPostWithRetry({
        url: 'http://localhost:1/callback', // 端口 1 不太可能有服务
        data: {},
        retryCount: 1,
        retryDelay: 50,
        timeout: 2000,
      });

      expect(result.success).toBe(false);
      expect(result.errorType).toBe('connection_refused');
    });
  });

  // ── 错误类型分类 ──

  describe('错误类型分类', () => {
    it('5xx 被分类为 server_error', async () => {
      setHandler((_req, res) => res.status(503).json({ error: 'Service Unavailable' }));

      const result = await httpPostWithRetry({
        url: `${BASE_URL}/callback`,
        data: {},
        retryCount: 0,
        retryDelay: 50,
      });

      expect(result.errorType).toBe('server_error');
    });

    it('4xx 被分类为 client_error', async () => {
      setHandler((_req, res) => res.status(422).json({ error: 'Unprocessable' }));

      const result = await httpPostWithRetry({
        url: `${BASE_URL}/callback`,
        data: {},
        retryCount: 0,
        retryDelay: 50,
      });

      expect(result.errorType).toBe('client_error');
    });
  });

  // ── duration 计时 ──

  describe('duration 计时', () => {
    it('成功请求有正确的 duration', async () => {
      setHandler((_req, res) => {
        setTimeout(() => res.status(200).json({ ok: true }), 100);
      });

      const result = await httpPostWithRetry({
        url: `${BASE_URL}/callback`,
        data: {},
        retryCount: 0,
      });

      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThanOrEqual(80); // 允许一点误差
    });

    it('失败请求也有 duration', async () => {
      setHandler((_req, res) => res.status(400).json({ error: 'bad' }));

      const result = await httpPostWithRetry({
        url: `${BASE_URL}/callback`,
        data: {},
        retryCount: 0,
      });

      expect(result.success).toBe(false);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  // ── 默认参数 ──

  describe('默认参数', () => {
    it('Content-Type 默认为 application/json', async () => {
      setHandler((_req, res) => res.status(200).json({ ok: true }));

      await httpPostWithRetry({
        url: `${BASE_URL}/callback`,
        data: {},
        retryCount: 0,
      });

      expect(requestLog[0].headers['content-type']).toContain('application/json');
    });
  });
});
