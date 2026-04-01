import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { loadAppConfig, getAppConfig, getStoreType } from './config/app.config';
import { requestIdMiddleware } from './middleware/request-id.middleware';
import { requestLogger } from './middleware/logger.middleware';
import { authRequired } from './middleware/auth.middleware';
import { asyncHandler } from './middleware/async-handler';
import { validateCallbackBody, validateTagBody } from './middleware/validator.middleware';
import { handleCallback, getReceivedCallbacks, clearReceivedCallbacks, getDispatchHistory, getDispatchStatsApi, getCallbackDiagnostic } from './controllers/callback.controller';
import * as configCtrl from './controllers/config.controller';
import * as authCtrl from './controllers/auth.controller';
import { healthCheck, systemStatus } from './controllers/health.controller';
import { initConfigWatcher } from './services/config.service';
import { initDefaultUser } from './services/auth.service';
import { initWal, recoverPendingDispatches } from './services/wal.service';
import { dispatchMessage } from './services/dispatch.service';
import { TSignCallbackMessage } from './types/callback.types';
import logger from './services/logger.service';

const app = express();

// ──── Request ID (must be first) ────
app.use(requestIdMiddleware);

// ──── Security Middleware ────
// SEC-013: Enable basic CSP (API-only backend, restrictive defaults)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
}));

// SEC-006: CORS — default to same-origin (reject cross-origin) unless explicitly configured
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
  : [];

app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : false,
  credentials: true,
}));

app.use(express.json({
  limit: '10mb',
  // 保存原始 body 用于 Content-Signature HMAC-SHA256 签名验证
  verify: (req: express.Request, _res, buf) => {
    (req as any).rawBody = buf.toString('utf8');
  },
}));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// ──── Rate Limiting ────
const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_RATE_MAX = 10;
const API_RATE_WINDOW_MS = 1 * 60 * 1000; // 1 minute
const API_RATE_MAX = 200;

const loginLimiter = rateLimit({
  windowMs: LOGIN_RATE_WINDOW_MS,
  max: LOGIN_RATE_MAX,
  message: { code: 429, message: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: API_RATE_WINDOW_MS,
  max: API_RATE_MAX,
  message: { code: 429, message: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', (req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/callback') return next();
  return apiLimiter(req, res, next);
});

// ──── Public Routes (no auth) ────
app.get('/api/health', healthCheck);
app.post('/api/callback', asyncHandler(handleCallback));
app.post('/api/auth/login', loginLimiter, asyncHandler(authCtrl.login));

// ──── Protected Routes (auth required) ────
app.get('/api/system-status', authRequired, systemStatus);

app.use('/api/auth/profile', authRequired);
app.get('/api/auth/profile', authCtrl.getProfile);

app.use('/api/auth/password', authRequired);
app.put('/api/auth/password', asyncHandler(authCtrl.updatePassword));

app.get('/api/received-callbacks', authRequired, getReceivedCallbacks);
app.delete('/api/received-callbacks', authRequired, clearReceivedCallbacks);

// Dispatch history & stats
app.get('/api/dispatch-history', authRequired, getDispatchHistory);
app.get('/api/dispatch-stats', authRequired, getDispatchStatsApi);

// Callback config CRUD
app.get('/api/callbacks/generate-keys', authRequired, configCtrl.generateKeys);
app.get('/api/callbacks', authRequired, asyncHandler(configCtrl.getCallbacks));
app.get('/api/callbacks/:id', authRequired, asyncHandler(configCtrl.getCallback));
app.post('/api/callbacks', authRequired, validateCallbackBody, asyncHandler(configCtrl.createCallback));
app.put('/api/callbacks/:id', authRequired, validateCallbackBody, asyncHandler(configCtrl.editCallback));
app.delete('/api/callbacks/:id', authRequired, asyncHandler(configCtrl.removeCallback));

// Tag config CRUD
app.get('/api/tags', authRequired, asyncHandler(configCtrl.getTags));
app.get('/api/tags/:id', authRequired, asyncHandler(configCtrl.getTag));
app.post('/api/tags', authRequired, validateTagBody, asyncHandler(configCtrl.createTag));
app.put('/api/tags/:id', authRequired, validateTagBody, asyncHandler(configCtrl.editTag));
app.delete('/api/tags/:id', authRequired, asyncHandler(configCtrl.removeTag));

// Logs
app.get('/api/logs', authRequired, asyncHandler(configCtrl.getLogs));

// TSign config
app.get('/api/tsign-config', authRequired, asyncHandler(configCtrl.getTSignConfig));
app.put('/api/tsign-config', authRequired, asyncHandler(configCtrl.updateTSignConfig));

// Callback diagnostic (最近一次回调失败的诊断信息)
app.get('/api/callback-diagnostic', authRequired, (_req, res) => {
  const diag = getCallbackDiagnostic();
  res.json({ code: 0, message: 'success', data: diag });
});

// Config versions
app.get('/api/versions/:type', authRequired, asyncHandler(configCtrl.getVersions));
app.post('/api/versions/:type/rollback', authRequired, asyncHandler(configCtrl.rollback));

// ──── Global error handling middleware ────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(`Unhandled route error: ${err.message}`, { stack: err.stack });
  if (!res.headersSent) {
    res.status(500).json({ code: 500, message: 'Internal server error' });
  }
});

// ──── Process-level crash protection ────
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception (process survived): ${err.message}`, { stack: err.stack });
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  logger.error(`Unhandled promise rejection: ${msg}`, { stack });
});

// ──── Async startup ────
async function bootstrap(): Promise<void> {
  logger.debug(`CONFIG_STORE=${process.env.CONFIG_STORE || '(not set)'}, resolved store type: ${getStoreType()}`);
  logger.debug(`JWT_SECRET: ${process.env.JWT_SECRET ? 'set from env' : 'using default (INSECURE)'}`);
  logger.debug(`ADMIN_DEFAULT_PASSWORD: ${process.env.ADMIN_DEFAULT_PASSWORD ? 'set from env' : 'using default'}`);

  // 1. 加载应用配置（通过 ConfigStore）
  await loadAppConfig();

  // 2. 初始化配置监听 + 内置标签
  await initConfigWatcher();

  // 3. 初始化默认用户
  await initDefaultUser();

  // 4. 初始化 WAL（消息持久化，防止崩溃丢失）
  initWal();

  // 5. 启动服务器
  const { port, host } = getAppConfig().server;
  app.listen(port, host, () => {
    const storeType = getStoreType();
    logger.info(`TSign Callback Dispatcher running at http://${host}:${port} [store=${storeType}]`);
  });

  // 6. 恢复上次崩溃时未完成的分发（异步，不阻塞服务启动）
  recoverPendingDispatches(async (message) => {
    const results = await dispatchMessage(message as unknown as TSignCallbackMessage);
    const hasFailures = results.some((r) => !r.success);
    const allSuccess = results.length > 0 && results.every((r) => r.success);
    return { allSuccess, hasFailures };
  }).catch((err) => {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[WAL] Recovery process failed: ${errMsg}`);
  });
}

bootstrap().catch((err) => {
  logger.error(`Failed to start: ${err.message}`, { stack: err.stack });
  process.exit(1);
});

export default app;
