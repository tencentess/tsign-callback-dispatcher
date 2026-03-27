import axios, { AxiosRequestConfig, AxiosError } from 'axios';
import logger from '../services/logger.service';

export interface HttpPostOptions {
  url: string;
  data: any;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
}

export interface HttpPostResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  errorType?: 'timeout' | 'dns' | 'connection_refused' | 'connection_reset' | 'server_error' | 'client_error' | 'network' | 'unknown';
  duration: number;
  retryCount: number;
  responseBody?: string;
}

/**
 * 对 Axios 错误进行分类，方便排查和监控
 */
function classifyError(err: AxiosError): { errorType: HttpPostResult['errorType']; message: string } {
  if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
    return { errorType: 'timeout', message: `Request timeout: ${err.message}` };
  }
  if (err.code === 'ENOTFOUND') {
    return { errorType: 'dns', message: `DNS resolution failed: ${err.message}` };
  }
  if (err.code === 'ECONNREFUSED') {
    return { errorType: 'connection_refused', message: `Connection refused: ${err.message}` };
  }
  if (err.code === 'ECONNRESET' || err.code === 'EPIPE') {
    return { errorType: 'connection_reset', message: `Connection reset: ${err.message}` };
  }
  if (err.response) {
    const status = err.response.status;
    if (status >= 500) {
      return { errorType: 'server_error', message: `HTTP ${status}: ${err.response.statusText}` };
    }
    if (status >= 400) {
      return { errorType: 'client_error', message: `HTTP ${status}: ${err.response.statusText}` };
    }
  }
  if (err.code) {
    return { errorType: 'network', message: `Network error (${err.code}): ${err.message}` };
  }
  return { errorType: 'unknown', message: err.message || 'Unknown error' };
}

/**
 * 判断错误是否值得重试
 * - 4xx 客户端错误不重试（除了 408 和 429）
 * - DNS 解析失败不重试（URL 本身有问题）
 */
function isRetryable(err: AxiosError): boolean {
  // DNS 错误不重试
  if (err.code === 'ENOTFOUND') {
    return false;
  }
  // 4xx 一般不重试，除了 408 (Request Timeout) 和 429 (Too Many Requests)
  if (err.response) {
    const status = err.response.status;
    if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
      return false;
    }
  }
  return true;
}

/**
 * 截取响应体摘要（用于日志，避免记录过大的内容）
 */
function getResponseBodySummary(data: unknown, maxLen = 200): string {
  if (data === null || data === undefined) return '';
  try {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
  } catch {
    return '[non-serializable]';
  }
}

export async function httpPostWithRetry(options: HttpPostOptions): Promise<HttpPostResult> {
  const {
    url,
    data,
    headers = {},
    params,
    timeout = 10000,
    retryCount = 3,
    retryDelay = 1000,
  } = options;

  let lastError = '';
  let lastErrorType: HttpPostResult['errorType'] = 'unknown';
  let attempts = 0;
  const totalStart = Date.now();

  for (let i = 0; i <= retryCount; i++) {
    attempts = i;

    const config: AxiosRequestConfig = {
      url,
      method: 'POST',
      data,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      params,
      timeout,
      // 不因非 2xx 状态码抛异常，我们自己处理
      validateStatus: () => true,
    };

    try {
      const response = await axios(config);

      if (response.status >= 200 && response.status < 300) {
        if (i > 0) {
          logger.info(`[HTTP] Request to ${url} succeeded on retry #${i}`);
        }
        return {
          success: true,
          statusCode: response.status,
          duration: Date.now() - totalStart,
          retryCount: attempts,
          responseBody: getResponseBodySummary(response.data),
        };
      }

      // 非 2xx 响应
      const responseSummary = getResponseBodySummary(response.data);
      lastError = `HTTP ${response.status}: ${response.statusText}`;
      lastErrorType = response.status >= 500 ? 'server_error' : 'client_error';

      // 4xx 非重试型直接结束
      if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
        logger.warn(
          `[HTTP] Non-retryable response from ${url}: ${lastError} body=${responseSummary}`
        );
        return {
          success: false,
          statusCode: response.status,
          error: lastError,
          errorType: lastErrorType,
          duration: Date.now() - totalStart,
          retryCount: attempts,
          responseBody: responseSummary,
        };
      }

      if (i < retryCount) {
        const delay = retryDelay * Math.pow(2, i); // 指数退避
        logger.warn(
          `[HTTP] Retryable response from ${url}: ${lastError}, retrying in ${delay}ms (attempt ${i + 1}/${retryCount}) body=${responseSummary}`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } catch (rawErr) {
      const err = rawErr as AxiosError;
      const classified = classifyError(err);
      lastError = classified.message;
      lastErrorType = classified.errorType;

      if (!isRetryable(err)) {
        logger.warn(
          `[HTTP] Non-retryable error to ${url}: ${lastError}`
        );
        return {
          success: false,
          error: lastError,
          errorType: lastErrorType,
          duration: Date.now() - totalStart,
          retryCount: attempts,
        };
      }

      if (i < retryCount) {
        const delay = retryDelay * Math.pow(2, i); // 指数退避
        logger.warn(
          `[HTTP] Request to ${url} failed: ${lastError}, retrying in ${delay}ms (attempt ${i + 1}/${retryCount})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  logger.error(
    `[HTTP] All ${retryCount + 1} attempts failed for ${url}: ${lastError}`
  );

  return {
    success: false,
    error: lastError,
    errorType: lastErrorType,
    duration: Date.now() - totalStart,
    retryCount: attempts,
  };
}
