import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCallback } from '../../src/controllers/callback.controller';
import type { Request, Response } from 'express';

// ── Mock dependencies ──

vi.mock('../../src/services/logger.service', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../src/services/decrypt.service', () => ({
  decryptCallbackMessage: vi.fn(),
  verifyCallbackSignature: vi.fn(),
  verifyContentSignatureHeader: vi.fn(),
}));

vi.mock('../../src/services/dispatch.service', () => ({
  dispatchMessage: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/services/dispatch-log.service', () => ({
  getDispatchRecords: vi.fn(),
  getDispatchStats: vi.fn(),
}));

vi.mock('../../src/config/app.config', () => ({
  getAppConfig: vi.fn().mockReturnValue({
    tsign: { token: 'test-token', encryptKey: '' },
    server: { port: 3001, host: '0.0.0.0' },
  }),
}));

// ── Helpers ──

function mockReq(
  body: Record<string, unknown> | null = {},
  query: Record<string, string> = {},
  options: { headers?: Record<string, string>; rawBody?: string } = {},
): Request {
  const headers = options.headers || {};
  const req: any = {
    body,
    query,
    method: 'POST',
    originalUrl: '/api/callback',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    headers,
    get(name: string) {
      return headers[name.toLowerCase()] || '';
    },
  };
  if (options.rawBody !== undefined) {
    req.rawBody = options.rawBody;
  }
  return req as Request;
}

function mockRes(): Response & { _status: number; _json: unknown } {
  const res: any = {
    _status: 0,
    _json: null,
    headersSent: false,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: unknown) {
      res._json = data;
      return res;
    },
  };
  return res;
}

// ══════════════════════════════════════════════════════════════════════
//  平台探测请求 — 空 body '{}' 快速返回 200
// ══════════════════════════════════════════════════════════════════════

describe('handleCallback - 平台探测请求（空 body）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('空 body {} 无 query 参数 → 200 success', async () => {
    const req = mockReq({}, {});
    const res = mockRes();

    await handleCallback(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toEqual({ code: 0, message: 'success' });
  });

  it('body 有其他字段但无 encrypt，无 query 参数 → 200（视为探测）', async () => {
    const req = mockReq({ foo: 'bar' }, {});
    const res = mockRes();

    await handleCallback(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toEqual({ code: 0, message: 'success' });
  });

  it('body 为 null（极端情况）→ 200', async () => {
    const req = mockReq(null as any, {});
    const res = mockRes();

    await handleCallback(req, res);

    expect(res._status).toBe(200);
    expect(res._json).toEqual({ code: 0, message: 'success' });
  });

  it('body 有 encrypt 字段 → 不走探测逻辑（进入正常处理流程）', async () => {
    const req = mockReq({ encrypt: 'some-encrypted-data' }, {});
    const res = mockRes();

    await handleCallback(req, res);

    // 有 encrypt 但无 query 签名参数 → 进入正常逻辑，不是探测
    expect(res._status).not.toBe(0); // 确认走了某个处理分支
  });

  it('无 encrypt 但有 query 参数 → 不走探测逻辑', async () => {
    const req = mockReq({}, { timestamp: '12345', nonce: 'abc', msg_signature: 'sig' });
    const res = mockRes();

    await handleCallback(req, res);

    // 有 query 参数 → 不视为探测，进入正常签名校验流程
    expect(res._status).not.toBe(0);
  });

  it('有 Content-Signature header → 不走探测逻辑', async () => {
    const rawBody = '{"encrypt":"test"}';
    const req = mockReq(
      { encrypt: 'test' },
      {},
      { headers: { 'content-signature': 'sha256=abc123' }, rawBody },
    );
    const res = mockRes();

    await handleCallback(req, res);

    // 有 Content-Signature → 不视为探测
    expect(res._status).not.toBe(0);
  });

  it('不应调用 decrypt 或 dispatch 服务', async () => {
    const decrypt = await import('../../src/services/decrypt.service');
    const dispatch = await import('../../src/services/dispatch.service');

    const req = mockReq({}, {});
    const res = mockRes();

    await handleCallback(req, res);

    expect(decrypt.decryptCallbackMessage).not.toHaveBeenCalled();
    expect(dispatch.dispatchMessage).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════
//  Content-Signature HMAC-SHA256 验签
// ══════════════════════════════════════════════════════════════════════

describe('handleCallback - Content-Signature HMAC-SHA256 验签', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Content-Signature 验证通过 → 继续处理', async () => {
    const decrypt = await import('../../src/services/decrypt.service');
    (decrypt.verifyContentSignatureHeader as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (decrypt.decryptCallbackMessage as ReturnType<typeof vi.fn>).mockReturnValue({
      MsgId: 'test-001',
      MsgType: 'FlowStatusChange',
      MsgVersion: '3.0',
      MsgData: {},
    });

    const rawBody = '{"encrypt":"encrypted-data"}';
    const req = mockReq(
      { encrypt: 'encrypted-data' },
      {},
      { headers: { 'content-signature': 'sha256=validhmac' }, rawBody },
    );
    const res = mockRes();

    await handleCallback(req, res);

    expect(decrypt.verifyContentSignatureHeader).toHaveBeenCalledWith(rawBody, 'sha256=validhmac');
    expect(res._status).toBe(200);
    expect(res._json).toEqual({ code: 0, message: 'success' });
  });

  it('Content-Signature 验证失败 → 403', async () => {
    const decrypt = await import('../../src/services/decrypt.service');
    (decrypt.verifyContentSignatureHeader as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const rawBody = '{"encrypt":"encrypted-data"}';
    const req = mockReq(
      { encrypt: 'encrypted-data' },
      {},
      { headers: { 'content-signature': 'sha256=badhmac' }, rawBody },
    );
    const res = mockRes();

    await handleCallback(req, res);

    expect(res._status).toBe(403);
    expect(res._json).toEqual({ code: 403, message: 'Content-Signature verification failed' });
  });

  it('Content-Signature 优先于 URL query 参数验签', async () => {
    const decrypt = await import('../../src/services/decrypt.service');
    (decrypt.verifyContentSignatureHeader as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (decrypt.decryptCallbackMessage as ReturnType<typeof vi.fn>).mockReturnValue({
      MsgId: 'test-002',
      MsgType: 'FlowStatusChange',
      MsgVersion: '3.0',
      MsgData: {},
    });

    const rawBody = '{"encrypt":"encrypted-data"}';
    const req = mockReq(
      { encrypt: 'encrypted-data' },
      { timestamp: '123', nonce: 'abc', msg_signature: 'sig' },
      { headers: { 'content-signature': 'sha256=validhmac' }, rawBody },
    );
    const res = mockRes();

    await handleCallback(req, res);

    // Content-Signature 优先，不应调用 URL query 验签
    expect(decrypt.verifyContentSignatureHeader).toHaveBeenCalled();
    expect(decrypt.verifyCallbackSignature).not.toHaveBeenCalled();
    expect(res._status).toBe(200);
  });
});
