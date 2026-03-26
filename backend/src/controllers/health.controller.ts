import { Request, Response } from 'express';

// SEC-011: Health check only returns status — no process internals on unauthenticated endpoint
export function healthCheck(req: Request, res: Response): void {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
}

// Authenticated system status — safe to expose process internals behind auth
export function systemStatus(_req: Request, res: Response): void {
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    memory: {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      rss: mem.rss,
    },
    timestamp: new Date().toISOString(),
  });
}
