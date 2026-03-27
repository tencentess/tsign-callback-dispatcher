import { describe, it, expect, vi, beforeEach } from 'vitest';
import { matchTags, shouldDispatch } from '../../src/services/tag-matcher.service';
import { TagMatchRule, TagValue } from '../../src/types/config.types';
import { TSignCallbackMessage } from '../../src/types/callback.types';

// Mock config.service 的 getTagsConfig，返回包含内置标签的配置
vi.mock('../../src/services/config.service', () => ({
  getTagsConfig: vi.fn(() => ({
    version: 1,
    updatedAt: new Date().toISOString(),
    tags: [
      {
        id: 'builtin-flowtype',
        name: '合同类型',
        key: 'FlowType',
        type: 'text',
        color: '#0052d9',
        builtIn: true,
        fieldPath: 'MsgData.FlowType',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'builtin-userdata',
        name: '自定义数据',
        key: 'UserData',
        type: 'text',
        color: '#e37318',
        builtIn: true,
        fieldPath: 'MsgData.UserData',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'custom-env',
        name: '环境',
        key: 'env',
        type: 'select',
        color: '#00a870',
        builtIn: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  })),
}));

vi.mock('../../src/services/logger.service', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// ---- 辅助函数 ----

function makeMessage(msgType: string, msgData: Record<string, any> = {}): TSignCallbackMessage {
  return {
    MsgId: `test-${Date.now()}`,
    MsgType: msgType,
    MsgVersion: 'v3',
    MsgData: { FlowId: 'flow-001', ...msgData },
  };
}

// ---- matchTags 测试 ----

describe('matchTags', () => {
  it('无规则时返回空数组', () => {
    const msg = makeMessage('FlowStatusChange');
    expect(matchTags(msg, [])).toEqual([]);
  });

  it('disabled 规则不参与匹配', () => {
    const msg = makeMessage('FlowStatusChange');
    const rules: TagMatchRule[] = [{
      id: 'r1', name: 'test', field: 'MsgType', operator: 'exact',
      value: 'FlowStatusChange', tags: ['tag1'], enabled: false,
    }];
    expect(matchTags(msg, rules)).toEqual([]);
  });

  it('exact 精确匹配', () => {
    const msg = makeMessage('FlowStatusChange');
    const rules: TagMatchRule[] = [{
      id: 'r1', name: 'test', field: 'MsgType', operator: 'exact',
      value: 'FlowStatusChange', tags: ['contract'], enabled: true,
    }];
    expect(matchTags(msg, rules)).toEqual(['contract']);
  });

  it('contains 包含匹配', () => {
    const msg = makeMessage('FlowStatusChange', { FlowName: '测试采购合同' });
    const rules: TagMatchRule[] = [{
      id: 'r1', name: 'test', field: 'MsgData.FlowName', operator: 'contains',
      value: '采购', tags: ['purchase'], enabled: true,
    }];
    expect(matchTags(msg, rules)).toEqual(['purchase']);
  });

  it('regex 正则匹配', () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'HR-Contract-2026' });
    const rules: TagMatchRule[] = [{
      id: 'r1', name: 'test', field: 'MsgData.FlowType', operator: 'regex',
      value: '^HR-', tags: ['hr'], enabled: true,
    }];
    expect(matchTags(msg, rules)).toEqual(['hr']);
  });

  it('in 列表匹配', () => {
    const msg = makeMessage('OperateSeal');
    const rules: TagMatchRule[] = [{
      id: 'r1', name: 'test', field: 'MsgType', operator: 'in',
      value: ['OperateSeal', 'SealUse'], tags: ['seal'], enabled: true,
    }];
    expect(matchTags(msg, rules)).toEqual(['seal']);
  });

  it('exists 存在性匹配', () => {
    const msg = makeMessage('FlowStatusChange', { UserData: 'some-data' });
    const rules: TagMatchRule[] = [{
      id: 'r1', name: 'test', field: 'MsgData.UserData', operator: 'exists',
      value: '', tags: ['has-userdata'], enabled: true,
    }];
    expect(matchTags(msg, rules)).toEqual(['has-userdata']);
  });

  it('exists 在字段不存在时不匹配', () => {
    const msg = makeMessage('FlowStatusChange');
    const rules: TagMatchRule[] = [{
      id: 'r1', name: 'test', field: 'MsgData.UserData', operator: 'exists',
      value: '', tags: ['has-userdata'], enabled: true,
    }];
    expect(matchTags(msg, rules)).toEqual([]);
  });

  it('嵌套字段路径访问', () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'purchase' });
    const rules: TagMatchRule[] = [{
      id: 'r1', name: 'test', field: 'MsgData.FlowType', operator: 'exact',
      value: 'purchase', tags: ['p'], enabled: true,
    }];
    expect(matchTags(msg, rules)).toEqual(['p']);
  });

  it('多条规则匹配去重', () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'sale' });
    const rules: TagMatchRule[] = [
      { id: 'r1', name: 'test1', field: 'MsgType', operator: 'exact', value: 'FlowStatusChange', tags: ['contract', 'sale'], enabled: true },
      { id: 'r2', name: 'test2', field: 'MsgData.FlowType', operator: 'exact', value: 'sale', tags: ['sale'], enabled: true },
    ];
    const result = matchTags(msg, rules);
    expect(result).toContain('contract');
    expect(result).toContain('sale');
    // sale 只出现一次
    expect(result.filter((t) => t === 'sale').length).toBe(1);
  });
});

// ---- shouldDispatch 内置标签过滤测试 ----

describe('shouldDispatch - 内置标签 FlowType 过滤', () => {
  it('无标签无规则，直接放行', async () => {
    const msg = makeMessage('FlowStatusChange');
    expect(await shouldDispatch(msg, { tags: [], matchRules: [] })).toBe(true);
  });

  it('FlowType 标签 - 消息包含该字段且值匹配 → 放行', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'purchase' });
    const tags: TagValue[] = [{ key: 'FlowType', value: 'purchase' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(true);
  });

  it('FlowType 标签 - 消息包含该字段但值不匹配 → 不分发', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'hr-contract' });
    const tags: TagValue[] = [{ key: 'FlowType', value: 'purchase' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(false);
  });

  it('FlowType 标签 - 消息不包含该字段（非合同回调）- 默认策略 dispatch → 放行', async () => {
    const msg = makeMessage('OperateSeal', { SealId: 'seal-001' });
    const tags: TagValue[] = [{ key: 'FlowType', value: 'purchase' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(true);
  });

  it('FlowType 标签 - 消息不包含该字段 - 策略 discard → 不分发', async () => {
    const msg = makeMessage('OperateSeal', { SealId: 'seal-001' });
    const tags: TagValue[] = [{ key: 'FlowType', value: 'purchase' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [], builtInTagMissPolicy: 'discard' })).toBe(false);
  });

  it('FlowType 标签 - 消息不包含该字段 - 策略 dispatch → 放行', async () => {
    const msg = makeMessage('OperateSeal', { SealId: 'seal-001' });
    const tags: TagValue[] = [{ key: 'FlowType', value: 'purchase' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [], builtInTagMissPolicy: 'dispatch' })).toBe(true);
  });

  it('FlowType 标签值为空 - 只要字段存在即放行', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'any-value' });
    const tags: TagValue[] = [{ key: 'FlowType', value: '' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(true);
  });

  it('FlowType 标签值为空 - 字段不存在 - 默认策略 dispatch → 放行', async () => {
    const msg = makeMessage('OperateSeal', { SealId: 'seal-001' });
    const tags: TagValue[] = [{ key: 'FlowType', value: '' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(true);
  });

  it('FlowType 标签值为空 - 字段不存在 - 策略 discard → 不分发', async () => {
    const msg = makeMessage('OperateSeal', { SealId: 'seal-001' });
    const tags: TagValue[] = [{ key: 'FlowType', value: '' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [], builtInTagMissPolicy: 'discard' })).toBe(false);
  });
});

describe('shouldDispatch - 内置标签 UserData 过滤', () => {
  it('UserData 标签 - 消息包含且值匹配 → 放行', async () => {
    const msg = makeMessage('FlowStatusChange', { UserData: 'project-abc' });
    const tags: TagValue[] = [{ key: 'UserData', value: 'project-abc' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(true);
  });

  it('UserData 标签 - 消息包含但值不匹配 → 不分发', async () => {
    const msg = makeMessage('FlowStatusChange', { UserData: 'project-xyz' });
    const tags: TagValue[] = [{ key: 'UserData', value: 'project-abc' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(false);
  });

  it('UserData 标签 - 消息不包含该字段 - 默认策略 dispatch → 放行', async () => {
    const msg = makeMessage('OperateSeal', { SealId: 'seal-001' });
    const tags: TagValue[] = [{ key: 'UserData', value: 'project-abc' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(true);
  });

  it('UserData 标签 - 消息不包含该字段 - 策略 discard → 不分发', async () => {
    const msg = makeMessage('OperateSeal', { SealId: 'seal-001' });
    const tags: TagValue[] = [{ key: 'UserData', value: 'project-abc' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [], builtInTagMissPolicy: 'discard' })).toBe(false);
  });

  it('UserData 标签值为空 - 只要字段存在且非空即放行', async () => {
    const msg = makeMessage('FlowStatusChange', { UserData: 'anything' });
    const tags: TagValue[] = [{ key: 'UserData', value: '' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(true);
  });

  it('UserData 字段存在但值为空字符串 - 等效于不存在 - 默认 dispatch → 放行', async () => {
    const msg = makeMessage('FlowStatusChange', { UserData: '' });
    const tags: TagValue[] = [{ key: 'UserData', value: 'project-abc' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(true);
  });

  it('UserData 字段存在但值为空字符串 - 策略 discard → 不分发', async () => {
    const msg = makeMessage('FlowStatusChange', { UserData: '' });
    const tags: TagValue[] = [{ key: 'UserData', value: 'project-abc' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [], builtInTagMissPolicy: 'discard' })).toBe(false);
  });

  it('UserData 字段存在但值为纯空格 - 等效于不存在 - 策略 discard → 不分发', async () => {
    const msg = makeMessage('FlowStatusChange', { UserData: '   ' });
    const tags: TagValue[] = [{ key: 'UserData', value: 'project-abc' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [], builtInTagMissPolicy: 'discard' })).toBe(false);
  });
});

describe('shouldDispatch - 多内置标签组合', () => {
  it('FlowType + UserData 同时配置 - 都匹配 → 放行', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'purchase', UserData: 'dept-a' });
    const tags: TagValue[] = [
      { key: 'FlowType', value: 'purchase' },
      { key: 'UserData', value: 'dept-a' },
    ];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(true);
  });

  it('FlowType + UserData 同时配置 - FlowType 匹配但 UserData 不匹配 → 不分发', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'purchase', UserData: 'dept-b' });
    const tags: TagValue[] = [
      { key: 'FlowType', value: 'purchase' },
      { key: 'UserData', value: 'dept-a' },
    ];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(false);
  });

  it('FlowType + UserData 同时配置 - FlowType 不存在 - 默认 dispatch → 放行（UserData 匹配）', async () => {
    const msg = makeMessage('OperateSeal', { SealId: 'seal-001', UserData: 'dept-a' });
    const tags: TagValue[] = [
      { key: 'FlowType', value: 'purchase' },
      { key: 'UserData', value: 'dept-a' },
    ];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(true);
  });

  it('FlowType + UserData 同时配置 - FlowType 不存在 - 策略 discard → 不分发', async () => {
    const msg = makeMessage('OperateSeal', { SealId: 'seal-001', UserData: 'dept-a' });
    const tags: TagValue[] = [
      { key: 'FlowType', value: 'purchase' },
      { key: 'UserData', value: 'dept-a' },
    ];
    expect(await shouldDispatch(msg, { tags, matchRules: [], builtInTagMissPolicy: 'discard' })).toBe(false);
  });
});

describe('shouldDispatch - 内置标签 + msgTypes 组合', () => {
  it('事件类型匹配 + 内置标签匹配 → 放行', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'purchase' });
    expect(await shouldDispatch(msg, {
      tags: [{ key: 'FlowType', value: 'purchase' }],
      matchRules: [],
      msgTypes: ['FlowStatusChange'],
    })).toBe(true);
  });

  it('事件类型不匹配 → 直接不分发（不走标签判断）', async () => {
    const msg = makeMessage('FlowCost', { FlowType: 'purchase' });
    expect(await shouldDispatch(msg, {
      tags: [{ key: 'FlowType', value: 'purchase' }],
      matchRules: [],
      msgTypes: ['FlowStatusChange'],
    })).toBe(false);
  });

  it('事件类型匹配 + 内置标签不匹配 → 不分发', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'hr' });
    expect(await shouldDispatch(msg, {
      tags: [{ key: 'FlowType', value: 'purchase' }],
      matchRules: [],
      msgTypes: ['FlowStatusChange'],
    })).toBe(false);
  });
});

describe('shouldDispatch - 内置标签 + 自定义规则混合', () => {
  it('内置标签通过 + 自定义规则通过 → 放行', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'purchase', FlowName: '采购合同' });
    const tags: TagValue[] = [
      { key: 'FlowType', value: 'purchase' },
      { key: 'env', value: 'prod' },
    ];
    const matchRules: TagMatchRule[] = [{
      id: 'r1', name: 'test', field: 'MsgData.FlowName', operator: 'contains',
      value: '采购', tags: ['env'], enabled: true,
    }];
    expect(await shouldDispatch(msg, { tags, matchRules })).toBe(true);
  });

  it('内置标签不通过 + 自定义规则通过 → 不分发（内置标签先判断）', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'hr', FlowName: '采购合同' });
    const tags: TagValue[] = [
      { key: 'FlowType', value: 'purchase' },
      { key: 'env', value: 'prod' },
    ];
    const matchRules: TagMatchRule[] = [{
      id: 'r1', name: 'test', field: 'MsgData.FlowName', operator: 'contains',
      value: '采购', tags: ['env'], enabled: true,
    }];
    expect(await shouldDispatch(msg, { tags, matchRules })).toBe(false);
  });

  it('内置标签通过 + 自定义规则不通过 → 不分发', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'purchase', FlowName: '销售合同' });
    const tags: TagValue[] = [
      { key: 'FlowType', value: 'purchase' },
      { key: 'env', value: 'prod' },
    ];
    const matchRules: TagMatchRule[] = [{
      id: 'r1', name: 'test', field: 'MsgData.FlowName', operator: 'contains',
      value: '采购', tags: ['env'], enabled: true,
    }];
    expect(await shouldDispatch(msg, { tags, matchRules })).toBe(false);
  });

  it('只有内置标签无自定义规则 - 内置通过即放行', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'purchase' });
    const tags: TagValue[] = [{ key: 'FlowType', value: 'purchase' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(true);
  });
});

// ---- shouldDispatch - matchMode 前缀匹配测试 ----

describe('shouldDispatch - matchMode 前缀匹配', () => {
  // ── FlowType 前缀匹配 ──

  it('FlowType 前缀匹配 - 消息值以配置值开头 → 放行', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'purchase-order-001' });
    const tags: TagValue[] = [{ key: 'FlowType', value: 'purchase', matchMode: 'prefix' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(true);
  });

  it('FlowType 前缀匹配 - 消息值完全等于配置值 → 放行（前缀包含完全匹配）', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'purchase' });
    const tags: TagValue[] = [{ key: 'FlowType', value: 'purchase', matchMode: 'prefix' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(true);
  });

  it('FlowType 前缀匹配 - 消息值不以配置值开头 → 不分发', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'hr-contract' });
    const tags: TagValue[] = [{ key: 'FlowType', value: 'purchase', matchMode: 'prefix' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(false);
  });

  it('FlowType 前缀匹配 - 配置值是消息值的超集 → 不分发', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'pur' });
    const tags: TagValue[] = [{ key: 'FlowType', value: 'purchase', matchMode: 'prefix' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(false);
  });

  // ── UserData 前缀匹配 ──

  it('UserData 前缀匹配 - 消息值以配置值开头 → 放行', async () => {
    const msg = makeMessage('FlowStatusChange', { UserData: 'dept-finance-team-a' });
    const tags: TagValue[] = [{ key: 'UserData', value: 'dept-finance', matchMode: 'prefix' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(true);
  });

  it('UserData 前缀匹配 - 不以配置值开头 → 不分发', async () => {
    const msg = makeMessage('FlowStatusChange', { UserData: 'dept-hr-team-b' });
    const tags: TagValue[] = [{ key: 'UserData', value: 'dept-finance', matchMode: 'prefix' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(false);
  });

  // ── exact 显式指定 ──

  it('matchMode=exact 显式指定 - 与默认行为一致（精确匹配）', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'purchase-order' });
    const tags: TagValue[] = [{ key: 'FlowType', value: 'purchase', matchMode: 'exact' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(false);
  });

  it('matchMode=exact 显式指定 - 完全匹配 → 放行', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'purchase' });
    const tags: TagValue[] = [{ key: 'FlowType', value: 'purchase', matchMode: 'exact' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(true);
  });

  // ── 未指定 matchMode（默认 exact）──

  it('matchMode 未指定 - 默认为 exact，不做前缀匹配', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'purchase-order' });
    const tags: TagValue[] = [{ key: 'FlowType', value: 'purchase' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(false);
  });

  // ── 前缀匹配 + 字段缺失场景 ──

  it('前缀匹配 + 字段不存在 - 默认策略 dispatch → 放行', async () => {
    const msg = makeMessage('OperateSeal', { SealId: 'seal-001' });
    const tags: TagValue[] = [{ key: 'FlowType', value: 'purchase', matchMode: 'prefix' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(true);
  });

  it('前缀匹配 + 字段不存在 - 策略 discard → 不分发', async () => {
    const msg = makeMessage('OperateSeal', { SealId: 'seal-001' });
    const tags: TagValue[] = [{ key: 'FlowType', value: 'purchase', matchMode: 'prefix' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [], builtInTagMissPolicy: 'discard' })).toBe(false);
  });

  // ── 多标签混合 matchMode ──

  it('FlowType 前缀匹配 + UserData 精确匹配 - 两者都通过 → 放行', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'purchase-order-001', UserData: 'dept-finance' });
    const tags: TagValue[] = [
      { key: 'FlowType', value: 'purchase', matchMode: 'prefix' },
      { key: 'UserData', value: 'dept-finance', matchMode: 'exact' },
    ];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(true);
  });

  it('FlowType 前缀匹配通过 + UserData 精确匹配不通过 → 不分发（AND 关系）', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'purchase-order-001', UserData: 'dept-hr' });
    const tags: TagValue[] = [
      { key: 'FlowType', value: 'purchase', matchMode: 'prefix' },
      { key: 'UserData', value: 'dept-finance', matchMode: 'exact' },
    ];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(false);
  });

  it('FlowType 精确匹配不通过 + UserData 前缀匹配通过 → 不分发（AND 关系）', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'hr-contract', UserData: 'dept-finance-team-a' });
    const tags: TagValue[] = [
      { key: 'FlowType', value: 'purchase', matchMode: 'exact' },
      { key: 'UserData', value: 'dept-finance', matchMode: 'prefix' },
    ];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(false);
  });

  it('两个标签都用前缀匹配 - 都通过 → 放行', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'purchase-order', UserData: 'dept-finance-team' });
    const tags: TagValue[] = [
      { key: 'FlowType', value: 'purchase', matchMode: 'prefix' },
      { key: 'UserData', value: 'dept-finance', matchMode: 'prefix' },
    ];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(true);
  });

  it('两个标签都用前缀匹配 - 一个不通过 → 不分发', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'purchase-order', UserData: 'dept-hr-team' });
    const tags: TagValue[] = [
      { key: 'FlowType', value: 'purchase', matchMode: 'prefix' },
      { key: 'UserData', value: 'dept-finance', matchMode: 'prefix' },
    ];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(false);
  });

  // ── 前缀匹配 + 空值配置 ──

  it('前缀匹配 + 空值配置 - 不检查值，字段存在即放行', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'any-type' });
    const tags: TagValue[] = [{ key: 'FlowType', value: '', matchMode: 'prefix' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(true);
  });

  // ── 前缀匹配 + msgTypes 组合 ──

  it('前缀匹配 + msgTypes 过滤 - 事件类型匹配且前缀匹配 → 放行', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'purchase-order-123' });
    expect(await shouldDispatch(msg, {
      tags: [{ key: 'FlowType', value: 'purchase', matchMode: 'prefix' }],
      matchRules: [],
      msgTypes: ['FlowStatusChange'],
    })).toBe(true);
  });

  it('前缀匹配 + msgTypes 过滤 - 事件类型不匹配 → 不分发（不走标签判断）', async () => {
    const msg = makeMessage('FlowCost', { FlowType: 'purchase-order-123' });
    expect(await shouldDispatch(msg, {
      tags: [{ key: 'FlowType', value: 'purchase', matchMode: 'prefix' }],
      matchRules: [],
      msgTypes: ['FlowStatusChange'],
    })).toBe(false);
  });

  // ── 前缀匹配 + 自定义规则混合 ──

  it('前缀匹配内置标签通过 + 自定义规则通过 → 放行', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'purchase-order', FlowName: '采购合同' });
    const tags: TagValue[] = [
      { key: 'FlowType', value: 'purchase', matchMode: 'prefix' },
      { key: 'env', value: 'prod' },
    ];
    const matchRules: TagMatchRule[] = [{
      id: 'r1', name: 'test', field: 'MsgData.FlowName', operator: 'contains',
      value: '采购', tags: ['env'], enabled: true,
    }];
    expect(await shouldDispatch(msg, { tags, matchRules })).toBe(true);
  });

  it('前缀匹配内置标签不通过 + 自定义规则通过 → 不分发', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'hr-contract', FlowName: '采购合同' });
    const tags: TagValue[] = [
      { key: 'FlowType', value: 'purchase', matchMode: 'prefix' },
      { key: 'env', value: 'prod' },
    ];
    const matchRules: TagMatchRule[] = [{
      id: 'r1', name: 'test', field: 'MsgData.FlowName', operator: 'contains',
      value: '采购', tags: ['env'], enabled: true,
    }];
    expect(await shouldDispatch(msg, { tags, matchRules })).toBe(false);
  });

  // ── 边界场景 ──

  it('前缀匹配 - 空前缀匹配任何非空值', async () => {
    // value='' 时 configTag.value 为空字符串，不进入值比较分支，直接通过
    const msg = makeMessage('FlowStatusChange', { FlowType: 'anything' });
    const tags: TagValue[] = [{ key: 'FlowType', value: '', matchMode: 'prefix' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(true);
  });

  it('前缀匹配 - 大小写敏感（精确匹配前缀大小写）', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'Purchase-Order' });
    const tags: TagValue[] = [{ key: 'FlowType', value: 'purchase', matchMode: 'prefix' }];
    // startsWith 是大小写敏感的
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(false);
  });

  it('前缀匹配 - 大小写完全一致则通过', async () => {
    const msg = makeMessage('FlowStatusChange', { FlowType: 'Purchase-Order' });
    const tags: TagValue[] = [{ key: 'FlowType', value: 'Purchase', matchMode: 'prefix' }];
    expect(await shouldDispatch(msg, { tags, matchRules: [] })).toBe(true);
  });
});
