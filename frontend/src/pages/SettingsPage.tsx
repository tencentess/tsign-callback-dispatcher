import React, { useState, useEffect } from 'react';
import {
  Tag, Loading, MessagePlugin, Table, Input, Button, Space,
} from 'tdesign-react';
import { LockOnIcon, BrowseOffIcon, BrowseIcon, LinkIcon, CloseCircleFilledIcon } from 'tdesign-icons-react';
import { fetchHealth, fetchLogs, fetchTSignConfig, updateTSignConfig } from '../lib/api';
import { OperationLog, TSignConfig } from '../types/api.types';

const CALLBACK_FAQ_URL = 'https://qian.tencent.com/developers/company/callback_types_v2#%E4%BA%94-%E5%9B%9E%E8%B0%83-faq';

const SettingsPage: React.FC = () => {
  const [health, setHealth] = useState<any>(null);
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // TSign config state
  const [tsignConfig, setTsignConfig] = useState<TSignConfig>({ encryptKey: '', token: '' });
  const [tsignForm, setTsignForm] = useState<TSignConfig>({ encryptKey: '', token: '' });
  const [showEncryptKey, setShowEncryptKey] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tsignDirty, setTsignDirty] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    setTsignDirty(
      tsignForm.encryptKey !== tsignConfig.encryptKey || tsignForm.token !== tsignConfig.token,
    );
  }, [tsignForm, tsignConfig]);

  const loadData = async () => {
    setLoading(true);
    const [healthData, logsData, tsignData] = await Promise.all([
      fetchHealth().catch(() => null),
      fetchLogs(200).catch(() => ({ logs: [], total: 0 })),
      fetchTSignConfig().catch(() => ({ encryptKey: '', token: '' })),
    ]);
    setHealth(healthData);
    setLogs(logsData.logs);
    setLogsTotal(logsData.total);
    setTsignConfig(tsignData);
    setTsignForm(tsignData);
    setLoading(false);
  };

  const handleSaveTSignConfig = async () => {
    setSaving(true);
    try {
      await updateTSignConfig(tsignForm);
      setTsignConfig({ ...tsignForm });
      MessagePlugin.success('加密配置已保存');
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
      cell: ({ row }: any) => (
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
    { colKey: 'detail', title: '详情', ellipsis: true },
    {
      colKey: 'timestamp',
      title: '时间',
      width: 180,
      cell: ({ row }: any) => new Date(row.timestamp).toLocaleString('zh-CN'),
    },
  ];

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loading /></div>;
  }

  return (
    <div className="space-y-6">
      {/* System Status */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-50">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">系统状态</h2>
        {health ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-sm text-green-600 font-medium">服务状态</p>
              <p className="text-xl font-bold text-green-700 mt-1">运行中</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-sm text-blue-600 font-medium">运行时长</p>
              <p className="text-xl font-bold text-blue-700 mt-1">
                {Math.floor((health.uptime || 0) / 3600)}h {Math.floor(((health.uptime || 0) % 3600) / 60)}m
              </p>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <p className="text-sm text-purple-600 font-medium">内存使用</p>
              <p className="text-xl font-bold text-purple-700 mt-1">
                {Math.round((health.memory?.heapUsed || 0) / 1024 / 1024)}MB
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-red-50 rounded-lg p-4">
            <p className="text-sm text-red-600 font-medium">无法连接到后端服务</p>
            <p className="text-xs text-red-500 mt-1">请检查后端服务是否已启动 (默认端口: 3001)</p>
          </div>
        )}
      </div>

      {/* TSign Encrypt Config */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <LockOnIcon size={20} className="text-primary" />
            <h2 className="text-lg font-semibold text-gray-800">回调加密配置</h2>
          </div>
          <a
            href={CALLBACK_FAQ_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-primary hover:text-primary-dark transition-colors"
          >
            <LinkIcon size={14} />
            查看官方文档
          </a>
        </div>

        <div className="bg-blue-50 rounded-lg p-3 mb-4">
          <p className="text-sm text-blue-700">
            腾讯电子签回调消息使用 AES 加密和 SHA1 签名验证。请在
            <a
              href={CALLBACK_FAQ_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline mx-1"
            >
              电子签开发者后台
            </a>
            获取 EncryptKey 和 Token，并在下方配置。配置后服务将自动对回调消息进行验签和解密。
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              EncryptKey <span className="text-gray-400 font-normal">（消息加密密钥）</span>
            </label>
            <div className="flex items-center gap-2">
              <Input
                value={tsignForm.encryptKey}
                onChange={(val) => setTsignForm((prev) => ({ ...prev, encryptKey: val as string }))}
                placeholder="请输入 EncryptKey"
                style={{ flex: 1 }}
                className={showEncryptKey ? '' : 'mask-password'}
                suffix={
                  <span className="flex items-center gap-1">
                    {tsignForm.encryptKey && (
                      <span
                        className="cursor-pointer text-gray-300 hover:text-gray-500"
                        onClick={() => setTsignForm((prev) => ({ ...prev, encryptKey: '' }))}
                      >
                        <CloseCircleFilledIcon size={16} />
                      </span>
                    )}
                    <span
                      className="cursor-pointer text-gray-400 hover:text-gray-600"
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
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Token <span className="text-gray-400 font-normal">（签名验证令牌）</span>
            </label>
            <div className="flex items-center gap-2">
              <Input
                value={tsignForm.token}
                onChange={(val) => setTsignForm((prev) => ({ ...prev, token: val as string }))}
                placeholder="请输入 Token"
                style={{ flex: 1 }}
                className={showToken ? '' : 'mask-password'}
                suffix={
                  <span className="flex items-center gap-1">
                    {tsignForm.token && (
                      <span
                        className="cursor-pointer text-gray-300 hover:text-gray-500"
                        onClick={() => setTsignForm((prev) => ({ ...prev, token: '' }))}
                      >
                        <CloseCircleFilledIcon size={16} />
                      </span>
                    )}
                    <span
                      className="cursor-pointer text-gray-400 hover:text-gray-600"
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
            <p className="text-xs text-gray-400">
              配置保存后立即生效，后端将使用新的密钥验签和解密回调消息
            </p>
            <Space>
              <Button
                variant="outline"
                disabled={!tsignDirty}
                onClick={() => setTsignForm({ ...tsignConfig })}
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
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-50">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">配置说明</h2>
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">腾讯电子签回调配置</h3>
            <p className="text-sm text-gray-600 mb-2">
              在腾讯电子签控制台设置回调地址为本服务地址，格式为：
            </p>
            <code className="block bg-gray-800 text-green-400 rounded-lg p-3 text-sm">
              http://your-domain:3001/api/callback
            </code>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">分发逻辑说明</h3>
            <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
              <li>收到回调后先进行签名验证和消息解密</li>
              <li>解密后根据匹配规则对消息打标签</li>
              <li>根据回调配置中关联的标签进行消息分发</li>
              <li>无标签配置的回调地址接收所有消息</li>
              <li>支持按消息类型过滤（如只接收合同状态变更）</li>
              <li>分发失败会自动重试，重试次数可配置</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Operation Logs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-50">
        <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">操作日志</h2>
          <Tag size="small" variant="light">{logsTotal} 条记录</Tag>
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
