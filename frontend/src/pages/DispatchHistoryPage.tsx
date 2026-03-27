import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Table, Tag, Loading, Button, MessagePlugin, Tooltip, Pagination, Dialog, Input,
} from 'tdesign-react';
import {
  RefreshIcon, CheckCircleIcon, CloseCircleIcon, TimeIcon,
  ErrorCircleIcon, SearchIcon,
} from 'tdesign-icons-react';
import { fetchDispatchHistory, fetchDispatchStats } from '../lib/api';
import { DispatchRecord, DispatchStats } from '../types/api.types';

const PAGE_SIZE = 20;

/** 错误类型中文映射 */
const ERROR_TYPE_LABELS: Record<string, { label: string; theme: 'danger' | 'warning' | 'default' }> = {
  timeout: { label: '超时', theme: 'warning' },
  dns: { label: 'DNS 失败', theme: 'danger' },
  connection_refused: { label: '连接拒绝', theme: 'danger' },
  connection_reset: { label: '连接重置', theme: 'warning' },
  server_error: { label: '服务端错误', theme: 'danger' },
  client_error: { label: '客户端错误', theme: 'warning' },
  network: { label: '网络错误', theme: 'danger' },
  unknown: { label: '未知', theme: 'default' },
};

const DispatchHistoryPage: React.FC = () => {
  const [records, setRecords] = useState<DispatchRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<DispatchStats | null>(null);
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);
  const [detailRecord, setDetailRecord] = useState<DispatchRecord | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [activeSearch, setActiveSearch] = useState('');

  // 防止并发请求
  const loadIdRef = useRef(0);

  const loadHistory = useCallback(async (page: number, showLoading = true, search = '') => {
    const loadId = ++loadIdRef.current;
    if (showLoading) setLoading(true);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const data = await fetchDispatchHistory(PAGE_SIZE, offset, search);
      // 防止旧请求覆盖新请求
      if (loadId !== loadIdRef.current) return;
      setRecords(data.records);
      setTotal(data.total);
    } catch {
      if (loadId === loadIdRef.current) {
        MessagePlugin.error('加载分发记录失败');
      }
    } finally {
      if (loadId === loadIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const data = await fetchDispatchStats();
      setStats(data);
    } catch {
      // stats 加载失败不影响主流程
    }
  }, []);

  useEffect(() => {
    loadHistory(1);
    loadStats();
  }, [loadHistory, loadStats]);

  const handlePageChange = (pageInfo: { current: number; pageSize: number }) => {
    const page = pageInfo.current;
    setCurrentPage(page);
    setExpandedRowKeys([]);
    loadHistory(page, true, activeSearch);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadHistory(currentPage, false, activeSearch), loadStats()]);
      MessagePlugin.success('数据已刷新');
    } finally {
      setRefreshing(false);
    }
  };

  /** 执行搜索 */
  const handleSearch = (value?: string) => {
    const keyword = value !== undefined ? value : searchValue;
    setActiveSearch(keyword);
    setCurrentPage(1);
    setExpandedRowKeys([]);
    loadHistory(1, true, keyword);
  };

  /** 清空搜索 */
  const handleClearSearch = () => {
    setSearchValue('');
    setActiveSearch('');
    setCurrentPage(1);
    setExpandedRowKeys([]);
    loadHistory(1, true, '');
  };

  const formatDuration = (ms?: number) => {
    if (ms === undefined || ms === null) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const columns = [
    {
      colKey: 'status',
      title: '状态',
      width: 80,
      cell: ({ row }: { row: DispatchRecord }) => {
        if (row.error) {
          return <Tag theme="danger" variant="light" size="small" icon={<ErrorCircleIcon />}>异常</Tag>;
        }
        if (row.failCount > 0) {
          return <Tag theme="warning" variant="light" size="small" icon={<CloseCircleIcon />}>部分失败</Tag>;
        }
        if (row.matchedTargets === 0) {
          return <Tag theme="default" variant="light" size="small">无匹配</Tag>;
        }
        return <Tag theme="success" variant="light" size="small" icon={<CheckCircleIcon />}>成功</Tag>;
      },
    },
    {
      colKey: 'msgType',
      title: '消息类型',
      width: 200,
      cell: ({ row }: { row: DispatchRecord }) => (
        <span className="font-mono text-xs text-sky-300">{row.msgType}</span>
      ),
    },
    {
      colKey: 'msgId',
      title: '消息 ID',
      width: 180,
      ellipsis: true,
      cell: ({ row }: { row: DispatchRecord }) => (
        <Tooltip content={row.msgId}>
          <span className="font-mono text-xs text-slate-400 cursor-default">{row.msgId}</span>
        </Tooltip>
      ),
    },
    {
      colKey: 'targets',
      title: '分发结果',
      width: 180,
      cell: ({ row }: { row: DispatchRecord }) => (
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-300">
            <span className="text-emerald-400 font-medium">{row.successCount}</span>
            <span className="text-slate-600 mx-1">/</span>
            <span className={`font-medium ${row.failCount > 0 ? 'text-red-400' : 'text-slate-500'}`}>{row.failCount}</span>
            <span className="text-slate-600 mx-1">/</span>
            <span className="text-slate-500">{row.matchedTargets}</span>
          </span>
          <span className="text-xs text-slate-600">成功/失败/匹配</span>
        </div>
      ),
    },
    {
      colKey: 'receivedAt',
      title: '接收时间',
      width: 180,
      cell: ({ row }: { row: DispatchRecord }) => (
        <span className="font-mono text-xs text-slate-400">
          {new Date(row.receivedAt).toLocaleString('zh-CN')}
        </span>
      ),
    },
    {
      colKey: 'actions',
      title: '操作',
      width: 80,
      cell: ({ row }: { row: DispatchRecord }) => (
        <Button
          theme="primary"
          variant="text"
          size="small"
          onClick={() => setDetailRecord(row)}
        >
          详情
        </Button>
      ),
    },
  ];

  /** 展开行：显示每个 target 的分发结果 */
  const renderExpandedRow = (record: DispatchRecord) => {
    if (!record.results || record.results.length === 0) {
      return (
        <div className="px-6 py-3 text-sm text-slate-500">
          {record.error ? `系统错误: ${record.error}` : '无分发目标'}
        </div>
      );
    }

    return (
      <div className="px-8 py-3 ml-8" style={{ color: '#cbd5e1' }}>
        <div className="text-xs font-medium mb-2 uppercase tracking-wider" style={{ color: 'rgba(56, 189, 248, 0.7)' }}>下游服务分发详情</div>
        <table className="w-full text-sm" style={{ color: '#cbd5e1' }}>
          <thead>
            <tr className="text-xs">
              <th className="text-left py-1.5 pr-3 font-medium" style={{ color: '#94a3b8' }}>目标名称</th>
              <th className="text-left py-1.5 pr-3 font-medium" style={{ color: '#94a3b8' }}>URL</th>
              <th className="text-left py-1.5 pr-3 font-medium" style={{ color: '#94a3b8' }}>状态</th>
              <th className="text-left py-1.5 pr-3 font-medium" style={{ color: '#94a3b8' }}>HTTP 状态码</th>
              <th className="text-left py-1.5 pr-3 font-medium" style={{ color: '#94a3b8' }}>耗时</th>
              <th className="text-left py-1.5 pr-3 font-medium" style={{ color: '#94a3b8' }}>重试</th>
              <th className="text-left py-1.5 font-medium" style={{ color: '#94a3b8' }}>错误</th>
            </tr>
          </thead>
          <tbody>
            {record.results.map((r, idx) => (
              <tr key={idx} className="border-t border-white/5">
                <td className="py-2 pr-3 text-slate-300 font-medium">{r.configName}</td>
                <td className="py-2 pr-3">
                  <Tooltip content={r.url}>
                    <span className="font-mono text-xs text-slate-400 max-w-[200px] truncate block">{r.url}</span>
                  </Tooltip>
                </td>
                <td className="py-2 pr-3">
                  {r.success ? (
                    <Tag theme="success" variant="light" size="small">成功</Tag>
                  ) : (
                    <Tag theme="danger" variant="light" size="small">
                      {r.errorType ? (ERROR_TYPE_LABELS[r.errorType]?.label || r.errorType) : '失败'}
                    </Tag>
                  )}
                </td>
                <td className="py-2 pr-3 font-mono text-xs text-slate-400">{r.statusCode || '-'}</td>
                <td className="py-2 pr-3 font-mono text-xs text-slate-400">{formatDuration(r.duration)}</td>
                <td className="py-2 pr-3 font-mono text-xs text-slate-400">{r.retryCount}</td>
                <td className="py-2">
                  {r.error ? (
                    <Tooltip content={r.error}>
                      <span className="text-xs text-red-400 max-w-[200px] truncate block cursor-default">{r.error}</span>
                    </Tooltip>
                  ) : (
                    <span className="text-slate-600">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (loading && records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loading />
        <span className="text-sm text-slate-500">正在加载分发记录...</span>
      </div>
    );
  }

  const successRate = stats && stats.totalDispatched > 0
    ? ((stats.totalSuccess / (stats.totalSuccess + stats.totalFailed)) * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-4 animate-fade-slide-in">
      {/* 统计卡片 */}
      {stats && (
        <div className="tech-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-sky-400 inline-block" />
              分发概览
            </h2>
            <div className="flex items-center gap-2">
              <Tag size="small" variant="light" theme="default">
                缓冲 {stats.bufferUsage.used}/{stats.bufferUsage.capacity}
              </Tag>
              <Button
                variant="outline"
                size="small"
                icon={<RefreshIcon />}
                loading={refreshing}
                onClick={handleRefresh}
              >
                刷新
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="tech-stat">
              <p className="text-xs text-sky-400 font-medium mb-2 uppercase tracking-wider">总分发次数</p>
              <p className="text-2xl font-bold text-sky-300 font-mono">{stats.totalDispatched.toLocaleString()}</p>
            </div>
            <div className="tech-stat">
              <p className="text-xs text-emerald-400 font-medium mb-2 uppercase tracking-wider">成功</p>
              <p className="text-2xl font-bold text-emerald-300 font-mono">{stats.totalSuccess.toLocaleString()}</p>
            </div>
            <div className="tech-stat">
              <p className="text-xs text-red-400 font-medium mb-2 uppercase tracking-wider">失败</p>
              <p className="text-2xl font-bold text-red-300 font-mono">{stats.totalFailed.toLocaleString()}</p>
            </div>
            <div className="tech-stat">
              <p className="text-xs text-purple-400 font-medium mb-2 uppercase tracking-wider">成功率</p>
              <p className="text-2xl font-bold text-purple-300 font-mono">
                {successRate}<span className="text-sm ml-0.5 text-purple-400">%</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 分发记录列表 */}
      <div className="tech-card">
        <div className="px-5 py-4 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid rgba(56, 189, 248, 0.08)' }}>
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2 flex-shrink-0">
            <span className="w-1 h-4 rounded-full bg-teal-400 inline-block" />
            分发记录
          </h2>
          <div className="flex items-center gap-3 flex-1 justify-end">
            <Input
              value={searchValue}
              onChange={(val) => setSearchValue(val as string)}
              onEnter={() => handleSearch()}
              onClear={handleClearSearch}
              placeholder="搜索消息 ID 或消息类型"
              prefixIcon={<SearchIcon />}
              clearable
              size="small"
              style={{ width: '280px' }}
            />
            {activeSearch && (
              <Tag size="small" variant="light" theme="primary" closable onClose={handleClearSearch}>
                搜索: {activeSearch}
              </Tag>
            )}
            <Tag size="small" variant="light">{total} 条{activeSearch ? '匹配' : '记录'}（最近 {stats?.bufferUsage.capacity || 500} 条）</Tag>
            {!stats && (
              <Button variant="outline" size="small" icon={<RefreshIcon />} loading={refreshing} onClick={handleRefresh}>
                刷新
              </Button>
            )}
          </div>
        </div>

        <Table
          data={records}
          columns={columns}
          rowKey="id"
          size="small"
          hover
          loading={loading}
          empty={
            <div className="py-8 text-center">
              <TimeIcon size={32} className="text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-500">暂无分发记录</p>
              <p className="text-xs text-slate-600 mt-1">回调消息分发后会自动记录在此</p>
            </div>
          }
          expandedRowKeys={expandedRowKeys}
          onExpandChange={(keys: (string | number)[]) => setExpandedRowKeys(keys.map(String))}
          expandedRow={({ row }: { row: DispatchRecord }) => renderExpandedRow(row)}
        />

        {/* 分页 */}
        {total > PAGE_SIZE && (
          <div className="px-5 py-3 flex justify-end bg-transparent" style={{ borderTop: '1px solid rgba(56, 189, 248, 0.08)' }}>
            <Pagination
              current={currentPage}
              total={total}
              pageSize={PAGE_SIZE}
              onChange={(pageInfo) => handlePageChange(pageInfo)}
              theme="simple"
            />
          </div>
        )}
      </div>

      {/* 最近失败记录 */}
      {stats && stats.recentFailures.length > 0 && (
        <div className="tech-card">
          <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(56, 189, 248, 0.08)' }}>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-red-400 inline-block" />
              最近失败记录
              <Tag size="small" variant="light" theme="danger">{stats.recentFailures.length}</Tag>
            </h2>
          </div>
          <div className="divide-y divide-white/5">
            {stats.recentFailures.slice(0, 10).map((record) => (
              <div
                key={record.id}
                className="px-5 py-3 flex items-center gap-4 hover:bg-white/[0.02] transition-colors cursor-pointer"
                onClick={() => setDetailRecord(record)}
              >
                <div className="flex-shrink-0">
                  {record.error ? (
                    <ErrorCircleIcon className="text-red-400" size={18} />
                  ) : (
                    <CloseCircleIcon className="text-amber-400" size={18} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-xs text-sky-300">{record.msgType}</span>
                    <span className="text-slate-600">·</span>
                    <span className="font-mono text-xs text-slate-500 truncate">{record.msgId}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {record.error ? (
                      <span className="text-red-400">{record.error}</span>
                    ) : (
                      <span>
                        失败 {record.failCount}/{record.matchedTargets} 目标:
                        {' '}
                        {record.results
                          .filter((r) => !r.success)
                          .map((r) => r.configName)
                          .join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 text-xs text-slate-500 font-mono">
                  {new Date(record.receivedAt).toLocaleString('zh-CN')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 详情弹窗 */}
      <Dialog
        visible={!!detailRecord}
        onClose={() => setDetailRecord(null)}
        header={
          <span className="flex items-center gap-2">
            分发详情
            {detailRecord && (
              <Tag size="small" variant="light" theme={detailRecord.failCount > 0 ? 'warning' : 'success'}>
                {detailRecord.failCount > 0 ? '部分失败' : '成功'}
              </Tag>
            )}
          </span>
        }
        width={800}
        footer={false}
        destroyOnClose
      >
        {detailRecord && (
          <div className="space-y-4 py-2" style={{ maxHeight: 'calc(80vh - 120px)', overflowY: 'auto' }}>
            {/* 基本信息 */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-slate-500">消息类型：</span>
                <span className="font-mono text-sky-300">{detailRecord.msgType}</span>
              </div>
              <div>
                <span className="text-slate-500">消息 ID：</span>
                <span className="font-mono text-slate-300 text-xs">{detailRecord.msgId}</span>
              </div>
              <div>
                <span className="text-slate-500">接收时间：</span>
                <span className="font-mono text-slate-300 text-xs">{new Date(detailRecord.receivedAt).toLocaleString('zh-CN')}</span>
              </div>
              <div>
                <span className="text-slate-500">匹配目标：</span>
                <span className="text-slate-300">{detailRecord.matchedTargets} / {detailRecord.totalTargets}</span>
              </div>
            </div>

            {detailRecord.error && (
              <div className="rounded-lg p-3" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                <span className="text-sm text-red-400">系统错误：{detailRecord.error}</span>
              </div>
            )}

            {/* 各 Target 分发结果 */}
            {detailRecord.results.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-slate-300 mb-2">分发目标详情</h3>
                <div className="space-y-2">
                  {detailRecord.results.map((r, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg p-3"
                      style={{
                        background: r.success ? 'rgba(16, 185, 129, 0.06)' : 'rgba(239, 68, 68, 0.06)',
                        border: `1px solid ${r.success ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)'}`,
                      }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          {r.success ? (
                            <CheckCircleIcon className="text-emerald-400" size={14} />
                          ) : (
                            <CloseCircleIcon className="text-red-400" size={14} />
                          )}
                          <span className="text-sm font-medium text-slate-200">{r.configName}</span>
                        </div>
                        {r.errorType && !r.success && (
                          <Tag
                            size="small"
                            variant="light"
                            theme={ERROR_TYPE_LABELS[r.errorType]?.theme || 'default'}
                          >
                            {ERROR_TYPE_LABELS[r.errorType]?.label || r.errorType}
                          </Tag>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div>
                          <span className="text-slate-500">URL：</span>
                          <span className="font-mono text-slate-400 break-all">{r.url}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">HTTP 状态码：</span>
                          <span className="font-mono text-slate-400">{r.statusCode || '-'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">耗时：</span>
                          <span className="font-mono text-slate-400">{formatDuration(r.duration)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">重试次数：</span>
                          <span className="font-mono text-slate-400">{r.retryCount}</span>
                        </div>
                        {r.error && (
                          <div className="col-span-2">
                            <span className="text-slate-500">错误信息：</span>
                            <span className="text-red-400 break-all">{r.error}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
};

export default DispatchHistoryPage;
