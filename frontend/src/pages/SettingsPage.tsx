import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Tag, Loading, MessagePlugin, Table, Input, Button, Space, Tooltip,
} from 'tdesign-react';
import { LockOnIcon, BrowseOffIcon, BrowseIcon, LinkIcon, CloseCircleFilledIcon, RefreshIcon, ErrorCircleIcon } from 'tdesign-icons-react';
import { fetchHealth, fetchLogs, fetchTSignConfig, updateTSignConfig, fetchCallbackDiagnostic, SystemStatus } from '../lib/api';
import { OperationLog, TSignConfig, CallbackDiagnostic } from '../types/api.types';

const CALLBACK_FAQ_URL = 'https://qian.tencent.com/developers/company/callback_types_v2#%E4%BA%94-%E5%9B%9E%E8%B0%83-faq';

const SettingsPage: React.FC = () => {
  const [health, setHealth] = useState<SystemStatus | null>(null);
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // TSign config state
  const [tsignConfig, setTsignConfig] = useState<TSignConfig>({ encryptKey: '', token: '' });
  const [tsignForm, setTsignForm] = useState<TSignConfig>({ encryptKey: '', token: '' });
  const [showEncryptKey, setShowEncryptKey] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [callbackDiag, setCallbackDiag] = useState<CallbackDiagnostic | null>(null);

  // 派生值：只要用户输入了新的非空值就视为有变更
  const tsignDirty = useMemo(() => !!tsignForm.encryptKey || !!tsignForm.token, [tsignForm.encryptKey, tsignForm.token]);

  // Format uptime to human-readable string
  const formatUptime = useCallback((seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (mins > 0) parts.push(`${mins}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
    return parts.join(' ');
  }, []);

  // Format log detail: try parse JSON, display readable
  const formatLogDetail = useCallback((detail: string) => {
    if (!detail) return '-';
    try {
      const parsed = JSON.parse(detail);
      if (typeof parsed === 'object') {
        return Object.entries(parsed)
          .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
          .join('  ·  ');
      }
    } catch {
      // not JSON
    }
    return detail;
  }, []);

  const handleRefreshStatus = async () => {
    setRefreshing(true);
    try {
      const [healthData, logsData, diagData] = await Promise.all([
        fetchHealth().catch(() => null),
        fetchLogs(200).catch(() => ({ logs: [], total: 0 })),
        fetchCallbackDiagnostic().catch(() => null),
      ]);
      setHealth(healthData);
      setLogs(logsData.logs);
      setLogsTotal(logsData.total);
      setCallbackDiag(diagData);
      MessagePlugin.success('数据已刷新');
    } catch {
      MessagePlugin.error('刷新失败');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [healthData, logsData, tsignData, diagData] = await Promise.all([
      fetchHealth().catch(() => null),
      fetchLogs(200).catch(() => ({ logs: [], total: 0 })),
      fetchTSignConfig().catch((): TSignConfig => ({ encryptKey: '', token: '', hasEncryptKey: false, hasToken: false })),
      fetchCallbackDiagnostic().catch(() => null),
    ]);
    setHealth(healthData);
    setLogs(logsData.logs);
    setLogsTotal(logsData.total);
    // 保存原始返回（含掩码值和 has* 标志）用于状态显示
    setTsignConfig(tsignData);
    // 表单初始化为空值，用户必须输入完整新值才能保存
    // 避免掩码值（如 D981****579E）被误保存为实际密钥
    setTsignForm({ encryptKey: '', token: '', hasEncryptKey: tsignData.hasEncryptKey, hasToken: tsignData.hasToken });
    setCallbackDiag(diagData);
    setLoading(false);
  };

  const handleSaveTSignConfig = async () => {
    setSaving(true);
    try {
      await updateTSignConfig(tsignForm);
      MessagePlugin.success('加密配置已保存');
      // 重新加载配置以获取最新的掩码值和 has* 标志
      const [tsignData, diagData] = await Promise.all([
        fetchTSignConfig().catch((): TSignConfig => ({ encryptKey: '', token: '', hasEncryptKey: false, hasToken: false })),
        fetchCallbackDiagnostic().catch(() => null),
      ]);
      setTsignConfig(tsignData);
      setTsignForm({ encryptKey: '', token: '', hasEncryptKey: tsignData.hasEncryptKey, hasToken: tsignData.hasToken });
      setCallbackDiag(diagData);
    } catch {
      MessagePlugin.error('保存失败，请检查后端服务');
    } finally {
      setSaving(false);
    }
  };

  const logColumns = [
    {
      colKey: 'type',
      title: '类型',
      width: 100,
      cell: ({ row }: { row: OperationLog }) => (
        <Tag
          theme={row.type === 'dispatch' ? 'primary' : row.type === 'config_change' ? 'warning' : 'default'}
          variant="light"
          size="small"
        >
          {row.type === 'dispatch' ? '分发' : row.type === 'config_change' ? '配置' : '系统'}
        </Tag>
      ),
    },
    { colKey: 'action', title: '操作', width: 160 },
    {
      colKey: 'detail',
      title: '详情',
      ellipsis: true,
      cell: ({ row }: { row: OperationLog }) => {
        const formatted = formatLogDetail(row.detail);
        return (
          <Tooltip content={formatted} placement="top-left" showArrow>
            <span className="text-sm text-slate-400 log-detail-text block cursor-default">{formatted}</span>
          </Tooltip>
        );
      },
    },
    {
      colKey: 'timestamp',
      title: '时间',
      width: 180,
      cell: ({ row }: { row: OperationLog }) => (
        <span className="font-mono text-xs text-slate-400">{new Date(row.timestamp).toLocaleString('zh-CN')}</span>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loading />
        <span className="text-sm text-slate-500">正在加载系统数据...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-slide-in">
      {/* System Status */}
      <div className="tech-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <span className="w-1 h-4 rounded-full bg-sky-400 inline-block" />
            系统状态
          </h2>
          <Button
            variant="outline"
            size="small"
            icon={<RefreshIcon />}
            loading={refreshing}
            onClick={handleRefreshStatus}
          >
            刷新
          </Button>
        </div>
        {health ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="tech-stat group">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 tech-pulse" />
                <p className="text-xs text-emerald-400 font-medium uppercase tracking-wider">运行中</p>
              </div>
              <p className="text-2xl font-bold text-emerald-300">Active</p>
            </div>
            <div className="tech-stat group">
              <p className="text-xs text-sky-400 font-medium mb-2 uppercase tracking-wider">运行时长</p>
              <p className="text-2xl font-bold text-sky-300 font-mono">
                {formatUptime(health.uptime || 0)}
              </p>
            </div>
            <div className="tech-stat group">
              <p className="text-xs text-purple-400 font-medium mb-2 uppercase tracking-wider">内存使用</p>
              <p className="text-2xl font-bold text-purple-300 font-mono">
                {Math.round((health.memory?.heapUsed || 0) / 1024 / 1024)}<span className="text-sm ml-1 text-purple-400">MB</span>
              </p>
            </div>
          </div>
        ) : (
          <div className="tech-stat !border-red-500/20">
            <p className="text-sm text-red-400 font-medium">无法连接到后端服务</p>
            <p className="text-xs text-red-500/60 mt-1">请检查后端服务是否已启动 (默认端口: 3001)</p>
          </div>
        )}
      </div>

      {/* TSign Encrypt Config */}
      <div className="tech-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <LockOnIcon size={20} className="text-sky-400" />
            <h2 className="text-base font-semibold text-slate-100">回调加密配置</h2>
          </div>
          <a
            href={CALLBACK_FAQ_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-sky-400 hover:text-sky-300 transition-colors"
          >
            <LinkIcon size={14} />
            查看官方文档
          </a>
        </div>

        <div className="rounded-lg p-3 mb-4" style={{ background: 'rgba(56, 189, 248, 0.06)', border: '1px solid rgba(56, 189, 248, 0.1)' }}>
          <p className="text-sm text-sky-300/80">
            腾讯电子签回调消息使用 AES 加密和 SHA1 签名验证。请在
            <a
              href={CALLBACK_FAQ_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline mx-1 text-sky-300"
            >
              电子签开发者后台
            </a>
            获取 EncryptKey 和 Token，并在下方配置。配置后服务将自动对回调消息进行验签和解密。
          </p>
        </div>

        {/* 回调诊断告警 */}
        {callbackDiag && (
          <div className="rounded-lg p-3 mb-4 flex items-start gap-2" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
            <ErrorCircleIcon size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-300">回调处理异常</p>
              <p className="text-sm text-red-400/90 mt-1">{callbackDiag.message}</p>
              <p className="text-xs text-red-500/60 mt-1">
                来源 IP: {callbackDiag.ip} · 时间: {new Date(callbackDiag.timestamp).toLocaleString('zh-CN')}
              </p>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              EncryptKey <span className="text-slate-500 font-normal">（消息加密密钥）</span>
            </label>
            <div className="flex items-center gap-2">
              <Input
                value={tsignForm.encryptKey}
                onChange={(val) => setTsignForm((prev) => ({ ...prev, encryptKey: val as string }))}
                placeholder={tsignConfig.hasEncryptKey ? `已配置 (${tsignConfig.encryptKey})，输入新值可替换` : '请输入 EncryptKey'}
                style={{ flex: 1 }}
                className={showEncryptKey ? '' : 'mask-password'}
                suffix={
                  <span className="flex items-center gap-1">
                    {tsignForm.encryptKey && (
                      <span
                        className="cursor-pointer text-slate-500 hover:text-slate-300"
                        onClick={() => setTsignForm((prev) => ({ ...prev, encryptKey: '' }))}
                      >
                        <CloseCircleFilledIcon size={16} />
                      </span>
                    )}
                    <span
                      className="cursor-pointer text-slate-500 hover:text-slate-300"
                      onClick={() => setShowEncryptKey(!showEncryptKey)}
                    >
                      {showEncryptKey ? <BrowseOffIcon size={16} /> : <BrowseIcon size={16} />}
                    </span>
                  </span>
                }
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Token <span className="text-slate-500 font-normal">（签名验证令牌）</span>
            </label>
            <div className="flex items-center gap-2">
              <Input
                value={tsignForm.token}
                onChange={(val) => setTsignForm((prev) => ({ ...prev, token: val as string }))}
                placeholder={tsignConfig.hasToken ? `已配置 (${tsignConfig.token})，输入新值可替换` : '请输入 Token'}
                style={{ flex: 1 }}
                className={showToken ? '' : 'mask-password'}
                suffix={
                  <span className="flex items-center gap-1">
                    {tsignForm.token && (
                      <span
                        className="cursor-pointer text-slate-500 hover:text-slate-300"
                        onClick={() => setTsignForm((prev) => ({ ...prev, token: '' }))}
                      >
                        <CloseCircleFilledIcon size={16} />
                      </span>
                    )}
                    <span
                      className="cursor-pointer text-slate-500 hover:text-slate-300"
                      onClick={() => setShowToken(!showToken)}
                    >
                      {showToken ? <BrowseOffIcon size={16} /> : <BrowseIcon size={16} />}
                    </span>
                  </span>
                }
              />
            </div>
          </div>
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-slate-500">
              配置保存后立即生效，后端将使用新的密钥验签和解密回调消息
            </p>
            <Space>
              <Button
                variant="outline"
                disabled={!tsignDirty}
                onClick={() => setTsignForm({ encryptKey: '', token: '', hasEncryptKey: tsignConfig.hasEncryptKey, hasToken: tsignConfig.hasToken })}
              >
                重置
              </Button>
              <Button
                theme="primary"
                disabled={!tsignDirty}
                loading={saving}
                onClick={handleSaveTSignConfig}
              >
                保存配置
              </Button>
            </Space>
          </div>
        </div>
      </div>

      {/* Configuration Guide */}
      <div className="tech-card p-5">
        <h2 className="text-base font-semibold text-slate-100 mb-4 flex items-center gap-2">
          <span className="w-1 h-4 rounded-full bg-teal-400 inline-block" />
          配置说明
        </h2>
        <div className="space-y-4">
          <div className="tech-stat">
            <h3 className="text-sm font-semibold text-slate-200 mb-2">腾讯电子签回调配置</h3>
            <p className="text-sm text-slate-400 mb-2">
              在腾讯电子签控制台设置回调地址为本服务地址，格式为：
            </p>
            <code className="block rounded-lg p-3 text-sm font-mono text-emerald-400" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(52, 211, 153, 0.15)' }}>
              http://your-domain:3001/api/callback
            </code>
          </div>
          <div className="tech-stat">
            <h3 className="text-sm font-semibold text-slate-200 mb-2">分发逻辑说明</h3>
            <ul className="text-sm text-slate-400 space-y-1.5 list-none">
              {[
                '收到回调后先进行签名验证和消息解密',
                '解密后根据匹配规则对消息打标签',
                '根据回调配置中关联的标签进行消息分发',
                '无标签配置的回调地址接收所有消息',
                '支持按消息类型过滤（如只接收合同状态变更）',
                '分发失败会自动重试，重试次数可配置',
              ].map((text, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-1 h-1 rounded-full bg-sky-400/60 mt-2 flex-shrink-0" />
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Operation Logs */}
      <div className="tech-card">
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(56, 189, 248, 0.08)' }}>
          <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
            <span className="w-1 h-4 rounded-full bg-amber-400 inline-block" />
            操作日志
          </h2>
          <div className="flex items-center gap-3">
            <Tag size="small" variant="light">{logsTotal} 条记录</Tag>
            <Button
              variant="text"
              size="small"
              icon={<RefreshIcon />}
              loading={refreshing}
              onClick={handleRefreshStatus}
            >
              刷新
            </Button>
          </div>
        </div>
        <Table
          data={logs}
          columns={logColumns}
          rowKey="id"
          size="small"
          empty="暂无操作日志"
          pagination={{
            pageSize: 20,
            total: logs.length,
          }}
        />
      </div>
    </div>
  );
};

export default SettingsPage;
