import { Request, Response, NextFunction } from 'express';
import logger from '../services/logger.service';

/** Paths that should never be logged (exact match or prefix). */
const SILENT_EXACT = new Set(['/', '/api/health', '/favicon.ico', '/robots.txt']);
const SILENT_PREFIXES = ['/.', '/wp-', '/cgi-bin'];

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (SILENT_EXACT.has(req.path) || SILENT_PREFIXES.some((p) => req.path.startsWith(p))) {
    return next();
  }

  const start = Date.now();
  const { method, url } = req;

  logger.debug(`→ ${method} ${url}`, { ip: req.ip });

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'warn' : 'debug';
    logger[level](`← ${method} ${url} ${res.statusCode} ${duration}ms`);
  });

  next();
}
