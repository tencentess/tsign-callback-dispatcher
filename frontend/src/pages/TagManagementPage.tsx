import React, { useState, useEffect } from 'react';
import {
  Table, Button, Tag, Dialog, Input, Select, MessagePlugin, Popconfirm, Loading, Space,
} from 'tdesign-react';
import { AddIcon, EditIcon, DeleteIcon, TagIcon } from 'tdesign-icons-react';
import { fetchTags, createTag, updateTag, deleteTag } from '../lib/api';
import { TagDefinition } from '../types/api.types';

const TAG_TYPE_OPTIONS = [
  { label: '文本输入', value: 'text' },
  { label: '下拉选择', value: 'select' },
];

const PRESET_COLORS = [
  '#1890ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1',
  '#13c2c2', '#eb2f96', '#2f54eb', '#fa8c16', '#a0d911',
];

const INITIAL_FORM = {
  name: '',
  key: '',
  type: 'text' as 'text' | 'select',
  options: [] as string[],
  color: '#1890ff',
  description: '',
};

const TagManagementPage: React.FC = () => {
  const [tags, setTags] = useState<TagDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingTag, setEditingTag] = useState<TagDefinition | null>(null);
  const [formData, setFormData] = useState({ ...INITIAL_FORM });
  const [optionInput, setOptionInput] = useState('');

  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    setLoading(true);
    const data = await fetchTags().catch(() => []);
    setTags(data);
    setLoading(false);
  };

  const handleAdd = () => {
    setEditingTag(null);
    setFormData({ ...INITIAL_FORM });
    setOptionInput('');
    setDialogVisible(true);
  };

  const handleEdit = (tag: TagDefinition) => {
    setEditingTag(tag);
    setFormData({
      name: tag.name,
      key: tag.key || '',
      type: tag.type || 'text',
      options: tag.options || [],
      color: tag.color,
      description: tag.description || '',
    });
    setOptionInput('');
    setDialogVisible(true);
  };

  const handleDelete = async (id: string) => {
    await deleteTag(id);
    MessagePlugin.success('删除成功');
    loadTags();
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      MessagePlugin.warning('请输入标签名称');
      return;
    }
    if (!formData.key.trim()) {
      MessagePlugin.warning('请输入标签键');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(formData.key)) {
      MessagePlugin.warning('标签键只能包含字母、数字和下划线');
      return;
    }
    if (formData.type === 'select' && formData.options.length === 0) {
      MessagePlugin.warning('下拉选择类型至少需要一个选项');
      return;
    }

    const submitData = {
      ...formData,
      options: formData.type === 'select' ? formData.options : undefined,
    };

    if (editingTag) {
      await updateTag(editingTag.id, submitData);
      MessagePlugin.success('更新成功');
    } else {
      await createTag(submitData);
      MessagePlugin.success('创建成功');
    }
    setDialogVisible(false);
    loadTags();
  };

  const handleAddOption = () => {
    const val = optionInput.trim();
    if (!val) return;
    if (formData.options.includes(val)) {
      MessagePlugin.warning('选项已存在');
      return;
    }
    setFormData({ ...formData, options: [...formData.options, val] });
    setOptionInput('');
  };

  const handleRemoveOption = (index: number) => {
    setFormData({
      ...formData,
      options: formData.options.filter((_, i) => i !== index),
    });
  };

  const columns = [
    {
      colKey: 'name',
      title: '标签名称',
      width: 180,
      cell: ({ row }: any) => (
        <div className="flex items-center gap-2">
          <Tag
            size="medium"
            style={{
              color: row.color,
              borderColor: row.color,
              backgroundColor: `${row.color}10`,
            }}
            variant="outline"
          >
            {row.name}
          </Tag>
          {row.builtIn && (
            <Tag size="small" variant="light" theme="warning">内置</Tag>
          )}
        </div>
      ),
    },
    {
      colKey: 'key',
      title: '标签键',
      width: 180,
      cell: ({ row }: any) => <code className="text-sm bg-gray-100 px-2 py-0.5 rounded">{row.key || '-'}</code>,
    },
    {
      colKey: 'type',
      title: '标签类型',
      width: 120,
      cell: ({ row }: any) => (
        <Tag size="small" variant="light" theme={row.type === 'select' ? 'primary' : 'default'}>
          {row.type === 'select' ? '下拉选择' : '文本输入'}
        </Tag>
      ),
    },
    {
      colKey: 'options',
      title: '可选值',
      ellipsis: true,
      cell: ({ row }: any) => (
        <div className="flex flex-wrap gap-1">
          {row.type === 'select' && row.options?.length ? (
            row.options.map((opt: string) => (
              <Tag key={opt} size="small" variant="light">{opt}</Tag>
            ))
          ) : (
            <span className="text-gray-400 text-xs">{row.type === 'text' ? '自由输入' : '-'}</span>
          )}
        </div>
      ),
    },
    {
      colKey: 'description',
      title: '描述',
      ellipsis: true,
      cell: ({ row }: any) => <span className="text-gray-500 text-sm">{row.description || '-'}</span>,
    },
    {
      colKey: 'updatedAt',
      title: '更新时间',
      width: 180,
      cell: ({ row }: any) => row.updatedAt ? new Date(row.updatedAt).toLocaleString('zh-CN') : '-',
    },
    {
      colKey: 'actions',
      title: '操作',
      width: 160,
      fixed: 'right' as const,
      cell: ({ row }: any) => (
        <Space>
          <Button theme="primary" variant="text" size="small" icon={<EditIcon />} onClick={() => handleEdit(row)}>
            编辑
          </Button>
          {!row.builtIn && (
            <Popconfirm content="确定删除此标签键？" onConfirm={() => handleDelete(row.id)}>
              <Button theme="danger" variant="text" size="small" icon={<DeleteIcon />}>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loading /></div>;
  }

  const labelStyle = 'w-24 text-right text-sm text-gray-600 flex-shrink-0 pt-2';
  const rowStyle = 'flex items-start gap-4';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">标签管理</h2>
            <p className="text-sm text-gray-500 mt-1">管理标签键定义，标签为 key-value 形式，用于回调配置中的消息过滤和分发</p>
          </div>
          <Button theme="primary" icon={<AddIcon />} onClick={handleAdd}>
            新建标签键
          </Button>
        </div>
      </div>

      {/* Table */}
      {tags.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-50 text-center">
          <TagIcon size={48} className="text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">暂无标签键，创建标签键来定义分发过滤规则</p>
          <Button theme="primary" variant="outline" icon={<AddIcon />} onClick={handleAdd}>
            新建标签键
          </Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-50">
          <Table
            data={tags}
            columns={columns}
            rowKey="id"
            hover
            stripe
            empty="暂无标签键"
          />
        </div>
      )}

      {/* Dialog */}
      <Dialog
        visible={dialogVisible}
        onClose={() => setDialogVisible(false)}
        header={editingTag ? '编辑标签键' : '新建标签键'}
        width={560}
        destroyOnClose
        footer={
          <div className="flex justify-center gap-4 py-1">
            <Button variant="outline" onClick={() => setDialogVisible(false)}>取消</Button>
            <Button theme="primary" onClick={handleSubmit}>确认</Button>
          </div>
        }
      >
        <div className="space-y-5 py-2">
          {/* 标签名称 */}
          <div className={rowStyle}>
            <label className={labelStyle}>
              <span className="text-red-500 mr-1">*</span>标签名称
            </label>
            <div className="flex-1">
              <Input
                value={formData.name}
                onChange={(val) => setFormData({ ...formData, name: String(val) })}
                placeholder="请输入标签名称，如：项目名称"
              />
            </div>
          </div>

          {/* 标签键 */}
          <div className={rowStyle}>
            <label className={labelStyle}>
              <span className="text-red-500 mr-1">*</span>标签键
            </label>
            <div className="flex-1">
              <Input
                value={formData.key}
                onChange={(val) => setFormData({ ...formData, key: String(val) })}
                placeholder="请输入标签键，如：project_name"
                disabled={editingTag?.builtIn}
              />
              <div className="text-xs text-gray-400 mt-1">
                {editingTag?.builtIn ? '内置标签键不可修改' : '只能包含字母、数字和下划线'}
              </div>
            </div>
          </div>

          {/* 标签类型 */}
          <div className={rowStyle}>
            <label className={labelStyle}>
              <span className="text-red-500 mr-1">*</span>标签类型
            </label>
            <div className="flex-1">
              <Select
                value={formData.type}
                onChange={(val) => setFormData({ ...formData, type: val as 'text' | 'select', options: [] })}
                options={TAG_TYPE_OPTIONS}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {/* 下拉选项（仅 select 类型显示） */}
          {formData.type === 'select' && (
            <div className={rowStyle}>
              <label className={labelStyle}>可选值</label>
              <div className="flex-1">
                <div className="flex flex-wrap gap-2 mb-2">
                  {formData.options.map((opt, index) => (
                    <Tag
                      key={index}
                      size="medium"
                      closable
                      onClose={() => handleRemoveOption(index)}
                      variant="light"
                    >
                      {opt}
                    </Tag>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={optionInput}
                    onChange={(val) => setOptionInput(String(val))}
                    placeholder="输入选项值"
                    onEnter={handleAddOption}
                    style={{ flex: 1 }}
                  />
                  <Button variant="outline" size="medium" onClick={handleAddOption}>
                    添加
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 标签颜色 */}
          <div className={rowStyle}>
            <label className={labelStyle}>标签颜色</label>
            <div className="flex-1">
              <div className="flex flex-wrap gap-2 mb-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setFormData({ ...formData, color: c })}
                    className={`w-7 h-7 rounded-lg cursor-pointer transition-all hover:scale-110 ${
                      formData.color === c ? 'ring-2 ring-offset-2 ring-primary' : ''
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-3">
                <Input
                  value={formData.color}
                  onChange={(val) => setFormData({ ...formData, color: String(val) })}
                  placeholder="#1890ff"
                  style={{ width: '140px' }}
                />
                <Tag
                  size="medium"
                  style={{
                    color: formData.color,
                    borderColor: formData.color,
                    backgroundColor: `${formData.color}10`,
                  }}
                  variant="outline"
                >
                  {formData.name || '预览'}
                </Tag>
              </div>
            </div>
          </div>

          {/* 描述 */}
          <div className={rowStyle}>
            <label className={labelStyle}>描述</label>
            <div className="flex-1">
              <Input
                value={formData.description}
                onChange={(val) => setFormData({ ...formData, description: String(val) })}
                placeholder="标签的用途说明"
              />
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
};

export default TagManagementPage;
