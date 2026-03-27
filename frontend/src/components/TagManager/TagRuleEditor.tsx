import React from 'react';
import { Button, Input, Select, Tag, Switch, Space } from 'tdesign-react';
import { AddIcon, DeleteIcon } from 'tdesign-icons-react';
import { TagMatchRule, TagDefinition } from '../../types/api.types';

interface TagRuleEditorProps {
  rules: TagMatchRule[];
  onChange: (rules: TagMatchRule[]) => void;
  availableTags: TagDefinition[];
}

const OPERATOR_OPTIONS = [
  { label: '精确匹配', value: 'exact' },
  { label: '包含匹配', value: 'contains' },
  { label: '正则匹配', value: 'regex' },
  { label: '枚举匹配', value: 'in' },
  { label: '字段存在', value: 'exists' },
];

const COMMON_FIELDS = [
  { label: '消息类型 (MsgType)', value: 'MsgType' },
  { label: '合同ID (MsgData.FlowId)', value: 'MsgData.FlowId' },
  { label: '合同名称 (MsgData.FlowName)', value: 'MsgData.FlowName' },
  { label: '操作类型 (MsgData.Operate)', value: 'MsgData.Operate' },
  { label: '合同状态 (MsgData.FlowCallbackStatus)', value: 'MsgData.FlowCallbackStatus' },
  { label: '印章名称 (MsgData.SealName)', value: 'MsgData.SealName' },
  { label: '模板名称 (MsgData.TemplateName)', value: 'MsgData.TemplateName' },
  { label: '组织ID (MsgData.OrganizationId)', value: 'MsgData.OrganizationId' },
  { label: '用户数据 (MsgData.UserData)', value: 'MsgData.UserData' },
];

const TagRuleEditor: React.FC<TagRuleEditorProps> = ({ rules, onChange, availableTags }) => {
  const addRule = () => {
    const newRule: TagMatchRule = {
      id: `rule-${Date.now()}`,
      name: '',
      field: 'MsgType',
      operator: 'exact',
      value: '',
      tags: [],
      enabled: true,
    };
    onChange([...rules, newRule]);
  };

  const updateRule = (index: number, updates: Partial<TagMatchRule>) => {
    const updated = [...rules];
    updated[index] = { ...updated[index], ...updates };
    onChange(updated);
  };

  const removeRule = (index: number) => {
    const updated = rules.filter((_, i) => i !== index);
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      {rules.map((rule, index) => (
        <div
          key={rule.id}
          className="rounded-lg p-4 space-y-3"
          style={{
            background: 'rgba(15, 23, 42, 0.5)',
            border: '1px solid rgba(56, 189, 248, 0.1)',
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-400">规则 {index + 1}</span>
              <Switch
                size="small"
                value={rule.enabled}
                onChange={(val) => updateRule(index, { enabled: val as boolean })}
              />
            </div>
            <button
              onClick={() => removeRule(index)}
              className="p-1 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400 cursor-pointer transition-colors"
            >
              <DeleteIcon size={14} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">规则名称</label>
              <Input
                size="small"
                value={rule.name}
                onChange={(val) => updateRule(index, { name: String(val) })}
                placeholder="如：合同签署完成"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">匹配字段</label>
              <Select
                size="small"
                value={rule.field}
                onChange={(val) => updateRule(index, { field: String(val) })}
                options={COMMON_FIELDS}
                filterable
                creatable
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">匹配方式</label>
              <Select
                size="small"
                value={rule.operator}
                onChange={(val) => updateRule(index, { operator: val as TagMatchRule['operator'] })}
                options={OPERATOR_OPTIONS}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">匹配值</label>
              {rule.operator === 'exists' ? (
                <Input size="small" disabled placeholder="字段存在即匹配" />
              ) : (
                <Input
                  size="small"
                  value={Array.isArray(rule.value) ? rule.value.join(',') : String(rule.value)}
                  onChange={(val) => {
                    const strVal = String(val);
                    if (rule.operator === 'in') {
                      updateRule(index, { value: strVal.split(',').map((s) => s.trim()) });
                    } else {
                      updateRule(index, { value: strVal });
                    }
                  }}
                  placeholder={rule.operator === 'in' ? '多个值用逗号分隔' : '匹配值'}
                />
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">匹配后分配标签</label>
            <Select
              size="small"
              value={rule.tags}
              onChange={(val) => updateRule(index, { tags: val as string[] })}
              multiple
              placeholder="选择标签键"
              options={availableTags.map((t) => ({ label: `${t.name} (${t.key})`, value: t.key }))}
              style={{ width: '100%' }}
            />
          </div>
        </div>
      ))}

      <Button
        variant="dashed"
        icon={<AddIcon />}
        onClick={addRule}
        block
        size="small"
      >
        添加匹配规则
      </Button>
    </div>
  );
};

export default TagRuleEditor;
