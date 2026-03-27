import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Table, Button, Tag, Dialog, Input, Switch, Select, InputNumber, Space,
  MessagePlugin, Popconfirm, Loading, Textarea, Tooltip, Checkbox, Radio,
} from 'tdesign-react';
import {
  AddIcon, EditIcon, DeleteIcon, CheckCircleIcon, CloseCircleIcon,
  InfoCircleIcon, AddCircleIcon, CloseIcon, ChevronDownIcon, ChevronRightIcon,
  JumpIcon,
} from 'tdesign-icons-react';
import { fetchCallbacks, createCallback, updateCallback, deleteCallback, fetchTags, generateKeys } from '../lib/api';
import { DispatchConfig, TagDefinition, TagValue, TagMatchRule, TagMatchMode, AppType, UnknownMsgTypePolicy, BuiltInTagMissPolicy } from '../types/api.types';
import { getEventCategories, getAllEventValues, getEventLabel, CallbackEventCategory } from '../constants/callbackEvents';
import TagRuleEditor from '../components/TagManager/TagRuleEditor';

const INITIAL_FORM_DATA = {
  name: '', url: '', appType: 'company' as AppType, tags: [] as TagValue[], matchRules: [] as TagMatchRule[], enabled: true,
  retryCount: 3, timeout: 10000, headers: {} as Record<string, string>, msgTypes: [] as string[],
  unknownMsgTypePolicy: 'dispatch' as UnknownMsgTypePolicy,
  builtInTagMissPolicy: 'dispatch' as BuiltInTagMissPolicy,
  encryptKey: '', signToken: '', reEncrypt: false, remark: '',
};

/* ============ 二级分类回调事件选择器 ============ */
const EventCategoryPicker: React.FC<{
  appType: AppType;
  selected: string[];
  onChange: (vals: string[]) => void;
}> = React.memo(({ appType, selected, onChange }) => {
  const categories = useMemo(() => getEventCategories(appType), [appType]);
  const allValues = useMemo(() => getAllEventValues(appType), [appType]);
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});

  // Use Set for O(1) lookup instead of Array.includes O(n)
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggleCat = useCallback((cat: string) => {
    setExpandedCats((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }, []);

  const isAllSelected = selectedSet.size === allValues.length && allValues.length > 0;
  const isPartialAll = selectedSet.size > 0 && selectedSet.size < allValues.length;

  const handleSelectAll = useCallback((checked: boolean) => {
    onChange(checked ? [...allValues] : []);
  }, [onChange, allValues]);

  const isCatAllSelected = useCallback((cat: CallbackEventCategory) =>
    cat.events.every((e) => selectedSet.has(e.value)), [selectedSet]);
  const isCatPartial = useCallback((cat: CallbackEventCategory) =>
    cat.events.some((e) => selectedSet.has(e.value)) && !isCatAllSelected(cat), [selectedSet, isCatAllSelected]);

  const handleCatToggle = useCallback((cat: CallbackEventCategory, checked: boolean) => {
    const catValues = cat.events.map((e) => e.value);
    if (checked) {
      const merged = Array.from(new Set([...selected, ...catValues]));
      onChange(merged);
    } else {
      const catSet = new Set(catValues);
      onChange(selected.filter((v) => !catSet.has(v)));
    }
  }, [selected, onChange]);

  const handleEventToggle = useCallback((value: string, checked: boolean) => {
    if (checked) {
      onChange([...selected, value]);
    } else {
      onChange(selected.filter((v) => v !== value));
    }
  }, [selected, onChange]);

  // Pre-compute per-category counts
  const catCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cat of categories) {
      counts[cat.category] = cat.events.filter((e) => selectedSet.has(e.value)).length;
    }
    return counts;
  }, [categories, selectedSet]);

  return (
    <div
      className="rounded-lg max-h-[320px] overflow-y-auto"
      style={{
        border: '1px solid rgba(56, 189, 248, 0.1)',
        background: 'rgba(15, 23, 42, 0.4)',
      }}
    >
      {/* 全选 */}
      <div
        className="flex items-center gap-2 px-3 py-2 sticky top-0 z-10"
        style={{
          background: 'rgba(15, 23, 42, 0.98)',
          borderBottom: '1px solid rgba(56, 189, 248, 0.08)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <Checkbox
          checked={isAllSelected}
          indeterminate={isPartialAll}
          onChange={handleSelectAll}
        />
        <span className="text-sm font-medium text-slate-300">
          全选所有事件
          <span className="text-slate-500 ml-1">({selectedSet.size}/{allValues.length})</span>
        </span>
      </div>
      {/* 分类列表 */}
      {categories.map((cat) => {
        const expanded = expandedCats[cat.category] === true;
        const catAllSelected = isCatAllSelected(cat);
        return (
          <div key={cat.category}>
            <div
              className="flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              onClick={() => toggleCat(cat.category)}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(56,189,248,0.06)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              {expanded ? (
                <ChevronDownIcon style={{ fontSize: 14, color: '#64748b' }} />
              ) : (
                <ChevronRightIcon style={{ fontSize: 14, color: '#64748b' }} />
              )}
              <Checkbox
                checked={catAllSelected}
                indeterminate={isCatPartial(cat)}
                onChange={(checked) => { handleCatToggle(cat, checked as boolean); }}
                onClick={({ e }) => e.stopPropagation()}
              />
              <span className="text-sm font-medium text-slate-400">
                {cat.category}
                <span className="text-slate-500 ml-1">
                  ({catCounts[cat.category] || 0}/{cat.events.length})
                </span>
              </span>
              {cat.docUrl && (
                <a
                  href={cat.docUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto mr-1 flex items-center gap-1 text-xs text-sky-400/70 hover:text-sky-300 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                  title="查看官方文档"
                >
                  <JumpIcon style={{ fontSize: 13 }} />
                  <span>文档</span>
                </a>
              )}
            </div>
            {expanded && (
              <div className="pl-12 pr-3 py-1 space-y-1" style={{ background: 'rgba(15, 23, 42, 0.3)' }}>
                {cat.events.map((evt) => (
                  <div key={evt.value} className="flex items-center gap-2 py-0.5">
                    <Checkbox
                      checked={selectedSet.has(evt.value)}
                      onChange={(checked) => handleEventToggle(evt.value, checked as boolean)}
                    />
                    <span className="text-sm text-slate-400">{evt.label}</span>
                    <span className="text-xs text-slate-600 ml-auto font-mono">{evt.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

type CallbackFormData = typeof INITIAL_FORM_DATA;

/* ============ 主页面 ============ */
const CallbackManagementPage: React.FC = () => {
  const [callbacks, setCallbacks] = useState<DispatchConfig[]>([]);
  const [tags, setTags] = useState<TagDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingCallback, setEditingCallback] = useState<DispatchConfig | null>(null);
  const [formData, setFormData] = useState<CallbackFormData>({ ...INITIAL_FORM_DATA });
  const [tagRows, setTagRows] = useState<TagValue[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [callbacksData, tagsData] = await Promise.all([
      fetchCallbacks().catch(() => []),
      fetchTags().catch(() => []),
    ]);
    setCallbacks(callbacksData);
    setTags(tagsData);
    setLoading(false);
  };

  const handleAdd = () => {
    setEditingCallback(null);
    // 新建时默认全选所有事件
    const allEvents = getAllEventValues('company');
    setFormData({ ...INITIAL_FORM_DATA, msgTypes: allEvents });
    setTagRows([]);
    setDialogVisible(true);
  };

  const handleEdit = (row: DispatchConfig) => {
    setEditingCallback(row);
    const appType = row.appType || 'company';
    // 空 msgTypes 表示"全部事件"，编辑时映射为全选
    const msgTypes = (row.msgTypes && row.msgTypes.length > 0)
      ? row.msgTypes
      : getAllEventValues(appType);
    setFormData({ ...INITIAL_FORM_DATA, ...row, msgTypes });
    setTagRows(row.tags?.length ? [...row.tags] : []);
    setDialogVisible(true);
  };

  const handleDelete = async (id: string) => {
    await deleteCallback(id);
    MessagePlugin.success('删除成功');
    loadData();
  };

  const handleSubmit = async () => {
    if (!formData.name?.trim()) {
      MessagePlugin.warning('请输入配置名称');
      return;
    }
    if (!formData.url?.trim()) {
      MessagePlugin.warning('请输入回调地址');
      return;
    }

    const allEvents = getAllEventValues(formData.appType || 'company');
    const isAllSelected = formData.msgTypes?.length === allEvents.length;

    const submitData = {
      ...formData,
      tags: tagRows.filter((t: TagValue) => t.key.trim()),
      // 全选时保存为空数组，表示"不过滤=全部事件"
      msgTypes: isAllSelected ? [] : (formData.msgTypes || []),
    };

    if (editingCallback) {
      await updateCallback(editingCallback.id, submitData);
      MessagePlugin.success('更新成功');
    } else {
      await createCallback(submitData);
      MessagePlugin.success('创建成功');
    }
    setDialogVisible(false);
    loadData();
  };

  const handleToggleEnabled = async (row: DispatchConfig) => {
    await updateCallback(row.id, { enabled: !row.enabled });
    MessagePlugin.success(row.enabled ? '已禁用' : '已启用');
    loadData();
  };

  const handleGenerateKey = async (field: 'encryptKey' | 'signToken') => {
    try {
      const keys = await generateKeys();
      setFormData((prev: CallbackFormData) => ({ ...prev, [field]: keys[field] }));
      MessagePlugin.success('已生成');
    } catch {
      MessagePlugin.error('生成失败');
    }
  };

  const handleAddTagRow = () => {
    setTagRows((prev) => [...prev, { key: '', value: '', matchMode: 'exact' as TagMatchMode }]);
  };

  const handleRemoveTagRow = (index: number) => {
    setTagRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleTagRowChange = (index: number, field: 'key' | 'value' | 'matchMode', value: string) => {
    setTagRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAppTypeChange = (val: string) => {
    const newAppType = val as AppType;
    // 切换应用类型时默认全选新类型的所有事件
    const allEvents = getAllEventValues(newAppType);
    setFormData((prev: CallbackFormData) => ({
      ...prev,
      appType: newAppType,
      msgTypes: allEvents,
    }));
  };

  // Stable callback for EventCategoryPicker to enable React.memo
  const handleMsgTypesChange = useCallback((vals: string[]) => {
    setFormData((prev: CallbackFormData) => ({ ...prev, msgTypes: vals }));
  }, []);

  const columns = [
    {
      colKey: 'name',
      title: '配置名称',
      width: 180,
      cell: ({ row }: { row: DispatchConfig }) => (
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${row.enabled ? 'bg-emerald-400 tech-pulse' : 'bg-slate-600'}`} />
          <span className="font-medium text-slate-200">{row.name}</span>
        </div>
      ),
    },
    {
      colKey: 'appType',
      title: '应用类型',
      width: 120,
      cell: ({ row }: { row: DispatchConfig }) => (
        <Tag size="small" variant="light" theme={row.appType === 'partner' ? 'warning' : 'primary'}>
          {row.appType === 'partner' ? '第三方应用' : '自建应用'}
        </Tag>
      ),
    },
    {
      colKey: 'url',
      title: '回调地址',
      ellipsis: true,
      cell: ({ row }: { row: DispatchConfig }) => (
        <span className="text-slate-400 text-sm font-mono">{row.url}</span>
      ),
    },
    {
      colKey: 'msgTypes',
      title: '回调事件',
      width: 220,
      cell: ({ row }: { row: DispatchConfig }) => {
        const appType = row.appType || 'company';
        return (
          <div className="flex flex-wrap gap-1">
            {row.msgTypes?.length ? (
              row.msgTypes.slice(0, 3).map((t: string) => {
                const lbl = getEventLabel(t, appType);
                return <Tag key={t} size="small" variant="light" theme="primary">{lbl || t}</Tag>;
              })
            ) : (
              <span className="text-slate-500 text-xs">全部事件</span>
            )}
            {(row.msgTypes?.length ?? 0) > 3 && <Tag size="small" variant="light">+{row.msgTypes!.length - 3}</Tag>}
          </div>
        );
      },
    },
    {
      colKey: 'tags',
      title: '标签',
      width: 250,
      cell: ({ row }: { row: DispatchConfig }) => (
        <div className="flex flex-wrap gap-1">
          {row.tags?.length ? (
            row.tags.map((t: TagValue, i: number) => {
              const tagDef = tags.find((td) => td.key === t.key);
              const isPrefix = t.matchMode === 'prefix';
              return (
                <Tooltip key={i} content={isPrefix ? `前缀匹配: ${t.value}*` : `完全匹配: ${t.value}`}>
                  <Tag size="small" variant="light" style={tagDef ? { color: tagDef.color, borderColor: `${tagDef.color}30` } : {}}>
                    {tagDef?.name || t.key}: {t.value}{isPrefix ? '*' : ''}
                  </Tag>
                </Tooltip>
              );
            })
          ) : (
            <span className="text-slate-500 text-xs">无标签</span>
          )}
        </div>
      ),
    },
    {
      colKey: 'enabled',
      title: '状态',
      width: 100,
      cell: ({ row }: { row: DispatchConfig }) => (
        <Tag theme={row.enabled ? 'success' : 'default'} variant="light" icon={row.enabled ? <CheckCircleIcon /> : <CloseCircleIcon />}>
          {row.enabled ? '启用' : '禁用'}
        </Tag>
      ),
    },
    {
      colKey: 'remark',
      title: '备注',
      width: 150,
      ellipsis: true,
      cell: ({ row }: { row: DispatchConfig }) => <span className="text-slate-400 text-sm">{row.remark || '-'}</span>,
    },
    {
      colKey: 'updatedAt',
      title: '更新时间',
      width: 180,
      cell: ({ row }: { row: DispatchConfig }) => (
        <span className="font-mono text-xs text-slate-400">
          {row.updatedAt ? new Date(row.updatedAt).toLocaleString('zh-CN') : '-'}
        </span>
      ),
    },
    {
      colKey: 'actions',
      title: '操作',
      width: 220,
      fixed: 'right' as const,
      cell: ({ row }: { row: DispatchConfig }) => (
        <Space>
          <Button theme="primary" variant="text" size="small" onClick={() => handleToggleEnabled(row)}>
            {row.enabled ? '禁用' : '启用'}
          </Button>
          <Button theme="primary" variant="text" size="small" icon={<EditIcon />} onClick={() => handleEdit(row)}>
            编辑
          </Button>
          <Popconfirm content={`确定要删除「${row.name}」回调配置吗？此操作不可恢复。`} onConfirm={() => handleDelete(row.id)}>
            <Button theme="danger" variant="text" size="small" icon={<DeleteIcon />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loading />
        <span className="text-sm text-slate-500">正在加载配置数据...</span>
      </div>
    );
  }

  const labelStyle = 'w-32 text-right text-sm text-slate-400 flex-shrink-0 pt-2';
  const rowStyle = 'flex items-start gap-4';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="tech-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <span className="w-1 h-4 rounded-full bg-sky-400 inline-block" />
              回调地址配置
            </h2>
            <p className="text-sm text-slate-400 mt-1.5 ml-3">管理消息分发的目标地址，支持按标签和消息类型进行精准分发</p>
          </div>
          <Button
            theme="primary"
            icon={<AddIcon />}
            onClick={handleAdd}
            style={{
              background: 'linear-gradient(135deg, rgba(56,189,248,0.9) 0%, rgba(13,148,136,0.9) 100%)',
              border: 'none',
            }}
          >
            新增配置
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="tech-card">
        <Table
          data={callbacks}
          columns={columns}
          rowKey="id"
          hover
          stripe
          empty="暂无回调配置，点击右上角新增"
        />
      </div>

      {/* Dialog Form */}
      <Dialog
        visible={dialogVisible}
        onClose={() => setDialogVisible(false)}
        header={editingCallback ? '编辑回调配置' : '回调配置'}
        width={720}
        top="5vh"
        destroyOnClose
        footer={
          <div className="flex justify-center gap-4 py-1">
            <Button variant="outline" onClick={() => setDialogVisible(false)}>取消</Button>
            <Button theme="primary" onClick={handleSubmit}>确认</Button>
          </div>
        }
      >
        <div className="space-y-5 py-2 overflow-y-auto pr-2" style={{ maxHeight: 'calc(90vh - 160px)' }}>
          {/* 配置名称 */}
          <div className={rowStyle}>
            <label className={labelStyle}>
              <span className="text-red-400 mr-1">*</span>配置名称
            </label>
            <div className="flex-1">
              <Input
                value={formData.name}
                onChange={(val) => setFormData({ ...formData, name: val })}
                placeholder="请输入配置名称，如：OA系统回调"
              />
            </div>
          </div>

          {/* 应用类型 */}
          <div className={rowStyle}>
            <label className={labelStyle}>
              <span className="text-red-400 mr-1">*</span>应用类型
            </label>
            <div className="flex-1 pt-1">
              <Radio.Group
                value={formData.appType}
                onChange={(val) => handleAppTypeChange(val as string)}
              >
                <Radio value="company">自建应用</Radio>
                <Radio value="partner">第三方应用</Radio>
              </Radio.Group>
            </div>
          </div>

          {/* 指定回调地址 */}
          <div className={rowStyle}>
            <label className={labelStyle}>
              <span className="text-red-400 mr-1">*</span>指定回调地址
              <Tooltip content="请输入用于接收回调通知的 HTTP/HTTPS 地址">
                <InfoCircleIcon className="ml-1 text-slate-500 cursor-pointer inline-block" style={{ fontSize: 14 }} />
              </Tooltip>
            </label>
            <div className="flex-1 flex items-center gap-2">
              <Input
                value={formData.url}
                onChange={(val) => setFormData({ ...formData, url: val })}
                placeholder="请输入"
                style={{ flex: 1 }}
              />
              <a
                href={
                  formData.appType === 'partner'
                    ? 'https://qian.tencent.com/developers/partner/callback_url'
                    : 'https://qian.tencent.com/developers/company/callback_url'
                }
                target="_blank"
                rel="noreferrer"
                className="text-sm whitespace-nowrap text-sky-400 hover:text-sky-300 transition-colors"
              >
                查看回调通知文档
              </a>
            </div>
          </div>

          {/* 加密 key */}
          <div className={rowStyle}>
            <label className={labelStyle}>
              加密 key
              <Tooltip content="用于对回调消息体进行 AES 加密，建议使用系统生成">
                <InfoCircleIcon className="ml-1 text-slate-500 cursor-pointer inline-block" style={{ fontSize: 14 }} />
              </Tooltip>
            </label>
            <div className="flex-1 flex items-center gap-2">
              <Input
                value={formData.encryptKey}
                onChange={(val) => setFormData({ ...formData, encryptKey: val })}
                placeholder="请输入"
                style={{ flex: 1 }}
              />
              <a
                className="text-sm whitespace-nowrap cursor-pointer text-sky-400 hover:text-sky-300 transition-colors"
                onClick={() => handleGenerateKey('encryptKey')}
              >
                点击系统生成
              </a>
            </div>
          </div>

          {/* 签名验证 token */}
          <div className={rowStyle}>
            <label className={labelStyle}>
              签名验证 token
              <Tooltip content="用于验证回调请求的签名，确保回调来源可信">
                <InfoCircleIcon className="ml-1 text-slate-500 cursor-pointer inline-block" style={{ fontSize: 14 }} />
              </Tooltip>
            </label>
            <div className="flex-1 flex items-center gap-2">
              <Input
                value={formData.signToken}
                onChange={(val) => setFormData({ ...formData, signToken: val })}
                placeholder="请输入"
                style={{ flex: 1 }}
              />
              <a
                className="text-sm whitespace-nowrap cursor-pointer text-sky-400 hover:text-sky-300 transition-colors"
                onClick={() => handleGenerateKey('signToken')}
              >
                点击系统生成
              </a>
            </div>
          </div>

          {/* 二次加密分发 */}
          <div className={rowStyle}>
            <label className={labelStyle}>
              二次加密分发
              <Tooltip content="开启后，分发到此地址时将使用上方配置的加密 key 和签名 token 重新加密消息。关闭则直接发送明文消息。">
                <InfoCircleIcon className="ml-1 text-slate-500 cursor-pointer inline-block" style={{ fontSize: 14 }} />
              </Tooltip>
            </label>
            <div className="flex-1 pt-2">
              <Switch
                value={formData.reEncrypt || false}
                onChange={(val) => setFormData({ ...formData, reEncrypt: val })}
              />
              <p className="text-xs text-slate-500 mt-1">
                {formData.reEncrypt
                  ? '分发时将使用加密 key 和签名 token 对消息重新加密后发送'
                  : '分发时直接发送明文消息到此地址'}
              </p>
            </div>
          </div>

          {/* 回调事件 - 二级分类 */}
          <div className={rowStyle}>
            <label className={labelStyle}>回调事件</label>
            <div className="flex-1">
              <EventCategoryPicker
                appType={formData.appType}
                selected={formData.msgTypes || []}
                onChange={handleMsgTypesChange}
              />
            </div>
          </div>

          {/* 未知事件策略 */}
          <div className={rowStyle}>
            <label className={labelStyle}>
              未知事件策略
              <Tooltip content="官方可能新增回调类型，此策略决定收到系统未收录的事件时如何处理">
                <InfoCircleIcon className="ml-1 text-slate-500 cursor-pointer inline-block" style={{ fontSize: 14 }} />
              </Tooltip>
            </label>
            <div className="flex-1">
              <Radio.Group
                value={formData.unknownMsgTypePolicy || 'dispatch'}
                onChange={(val) => setFormData({ ...formData, unknownMsgTypePolicy: val as UnknownMsgTypePolicy })}
              >
                <Radio value="dispatch">全量分发（推荐）</Radio>
                <Radio value="discard">丢弃</Radio>
              </Radio.Group>
              <p className="text-xs text-slate-500 mt-1">
                {(formData.unknownMsgTypePolicy || 'dispatch') === 'dispatch'
                  ? '收到系统未收录的新回调类型时，仍会分发到此地址'
                  : '收到系统未收录的新回调类型时，将被忽略不分发'}
              </p>
            </div>
          </div>

          {/* 标签 */}
          <div className={rowStyle}>
            <label className={labelStyle}>标签</label>
            <div className="flex-1">
              <div className="space-y-2">
                {tagRows.map((tagRow, index) => {
                  const tagDef = tags.find((td) => td.key === tagRow.key);
                  return (
                    <div key={index} className="flex items-center gap-2">
                      <Select
                        value={tagRow.key}
                        onChange={(val) => handleTagRowChange(index, 'key', String(val))}
                        placeholder="选择标签键"
                        options={tags.map((t) => ({ label: `${t.name} (${t.key})`, value: t.key }))}
                        style={{ width: '35%' }}
                        filterable
                      />
                      {tagDef?.type === 'select' ? (
                        <Select
                          value={tagRow.value}
                          onChange={(val) => handleTagRowChange(index, 'value', String(val))}
                          placeholder="选择值"
                          options={(tagDef.options || []).map((o) => ({ label: o, value: o }))}
                          style={{ flex: 1 }}
                        />
                      ) : (
                        <Input
                          value={tagRow.value}
                          onChange={(val) => handleTagRowChange(index, 'value', String(val))}
                          placeholder="输入标签值"
                          style={{ flex: 1 }}
                        />
                      )}
                      <Select
                        value={tagRow.matchMode || 'exact'}
                        onChange={(val) => handleTagRowChange(index, 'matchMode', String(val))}
                        options={[
                          { label: '完全匹配', value: 'exact' },
                          { label: '前缀匹配', value: 'prefix' },
                        ]}
                        style={{ width: '120px' }}
                        size="medium"
                      />
                      <Button
                        theme="default"
                        variant="text"
                        size="small"
                        icon={<CloseIcon />}
                        onClick={() => handleRemoveTagRow(index)}
                      />
                    </div>
                  );
                })}
                <a
                  className="text-sm cursor-pointer inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 transition-colors"
                  onClick={handleAddTagRow}
                >
                  <AddCircleIcon style={{ fontSize: 14 }} />
                  新增一行
                </a>
              </div>
            </div>
          </div>

          {/* 内置标签字段缺失策略 */}
          <div className={rowStyle}>
            <label className={labelStyle}>
              字段缺失策略
              <Tooltip content="很多类型的回调消息（如印章、模板、员工等）不包含 FlowType/UserData 字段。此策略决定当回调消息中缺少已配置的内置标签字段时如何处理。">
                <InfoCircleIcon className="ml-1 text-slate-500 cursor-pointer inline-block" style={{ fontSize: 14 }} />
              </Tooltip>
            </label>
            <div className="flex-1">
              <Radio.Group
                value={formData.builtInTagMissPolicy || 'dispatch'}
                onChange={(val) => setFormData({ ...formData, builtInTagMissPolicy: val as BuiltInTagMissPolicy })}
              >
                <Radio value="dispatch">接受（推荐）</Radio>
                <Radio value="discard">丢弃</Radio>
              </Radio.Group>
              <p className="text-xs text-slate-500 mt-1">
                {(formData.builtInTagMissPolicy || 'dispatch') === 'dispatch'
                  ? '回调消息中缺少内置标签字段（如 FlowType/UserData）时，仍然接受并分发'
                  : '回调消息中缺少内置标签字段（如 FlowType/UserData）时，丢弃不分发'}
              </p>
            </div>
          </div>

          {/* 备注 */}
          <div className={rowStyle}>
            <label className={labelStyle}>备注</label>
            <div className="flex-1">
              <Input
                value={formData.remark}
                onChange={(val) => setFormData({ ...formData, remark: val })}
                placeholder="请输入"
              />
            </div>
          </div>

          {/* 分割线 - 高级配置 */}
          <div className="pt-4 mt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-sm font-medium text-slate-300 mb-4 pl-1">高级配置</div>
          </div>

          {/* 重试次数 + 超时时间 */}
          <div className={rowStyle}>
            <label className={labelStyle}>重试次数</label>
            <div className="flex-1 flex items-start gap-4">
              <InputNumber
                value={formData.retryCount}
                onChange={(val) => setFormData({ ...formData, retryCount: Number(val) || 0 })}
                min={0}
                max={10}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div className={rowStyle}>
            <label className={labelStyle}>超时时间 (ms)</label>
            <div className="flex-1">
              <InputNumber
                value={formData.timeout}
                onChange={(val) => setFormData({ ...formData, timeout: Number(val) || 10000 })}
                min={1000}
                max={60000}
                step={1000}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* 启用状态 */}
          <div className={rowStyle}>
            <label className={labelStyle}>启用状态</label>
            <div className="flex-1 pt-2">
              <Switch value={formData.enabled} onChange={(val) => setFormData({ ...formData, enabled: val })} />
            </div>
          </div>

          {/* 自定义请求头 */}
          <div className={rowStyle}>
            <label className={labelStyle}>自定义请求头</label>
            <div className="flex-1">
              <Textarea
                value={formData.headers ? JSON.stringify(formData.headers, null, 2) : '{}'}
                onChange={(val) => {
                  try {
                    const parsed = JSON.parse(String(val) || '{}');
                    setFormData({ ...formData, headers: parsed });
                  } catch {
                    // ignore parse error during typing
                  }
                }}
                placeholder='{"Authorization": "Bearer xxx"}'
                autosize={{ minRows: 2, maxRows: 5 }}
              />
            </div>
          </div>

          {/* 匹配规则 */}
          <div className={rowStyle}>
            <label className={labelStyle}>匹配规则</label>
            <div className="flex-1">
              <TagRuleEditor
                rules={formData.matchRules || []}
                onChange={(rules) => setFormData({ ...formData, matchRules: rules })}
                availableTags={tags}
              />
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
};

export default CallbackManagementPage;
