import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * AsyncLocalStorage 用于在整个请求生命周期内透传 requestId，
 * 使得 service 层的日志也能自动关联 requestId。
 */
export const requestContext = new AsyncLocalStorage<{ requestId: string }>();

/**
 * 获取当前请求上下文中的 requestId（可在任意位置调用）
 */
export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

/**
 * request-id 中间件:
 * 1. 优先使用前端传递的 X-Request-Id
 * 2. 否则自动生成
 * 3. 将 requestId 写入 AsyncLocalStorage 并回写到 response header
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();

  // 挂到 req 对象上方便直接访问
  (req as any).requestId = requestId;

  // 回写到响应头，前端可以用来排查
  res.setHeader('X-Request-Id', requestId);

  // 在 AsyncLocalStorage 中运行后续中间件和 handler
  requestContext.run({ requestId }, () => {
    next();
  });
}
