import { TSignCallbackMessage, ALL_KNOWN_MSG_TYPES } from '../types/callback.types';
import { TagMatchRule, TagValue, UnknownMsgTypePolicy, BuiltInTagMissPolicy } from '../types/config.types';
import { getTagsConfig } from './config.service';
import logger from './logger.service';

// Regex cache to avoid recompiling on every match
const regexCache = new Map<string, RegExp>();
const REGEX_MAX_LENGTH = 200;
const REDOS_PATTERN = /(\.\*){3,}|(\+\+)|(\*\*)|(\?\?)|((\\.|\[.*?\])\{[^}]*,[^}]*\}){2,}/;

function isSafeRegex(pattern: string): boolean {
  if (pattern.length > REGEX_MAX_LENGTH) return false;
  if (REDOS_PATTERN.test(pattern)) return false;
  return true;
}

function getCachedRegex(pattern: string): RegExp | null {
  let re = regexCache.get(pattern);
  if (!re) {
    if (!isSafeRegex(pattern)) {
      logger.warn(`Rejected potentially unsafe regex pattern: ${pattern.substring(0, 50)}...`);
      return null;
    }
    try {
      re = new RegExp(pattern, 'i');
    } catch {
      logger.warn(`Invalid regex pattern: ${pattern.substring(0, 50)}`);
      return null;
    }
    regexCache.set(pattern, re);
    if (regexCache.size > 500) {
      const firstKey = regexCache.keys().next().value;
      if (firstKey !== undefined) regexCache.delete(firstKey);
    }
  }
  return re;
}

function getNestedValue(obj: any, fieldPath: string): any {
  const parts = fieldPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

function matchRule(value: any, rule: TagMatchRule): boolean {
  if (value === undefined || value === null) {
    return rule.operator === 'exists' ? false : false;
  }

  const strValue = String(value);

  switch (rule.operator) {
    case 'exact':
      return strValue === String(rule.value);

    case 'contains':
      return strValue.includes(String(rule.value));

    case 'regex': {
      const regex = getCachedRegex(String(rule.value));
      if (!regex) return false;
      return regex.test(strValue);
    }

    case 'in': {
      const values = Array.isArray(rule.value) ? rule.value : [rule.value];
      return values.includes(strValue);
    }

    case 'exists':
      return true;

    default:
      return false;
  }
}

export function matchTags(message: TSignCallbackMessage, rules: TagMatchRule[]): string[] {
  const matchedTags = new Set<string>();

  for (const rule of rules) {
    if (!rule.enabled) continue;

    const value = getNestedValue(message, rule.field);
    const isMatch = matchRule(value, rule);

    if (isMatch) {
      rule.tags.forEach((tag) => matchedTags.add(tag));
      logger.debug(`Rule "${rule.name}" matched: field=${rule.field}, value=${value}`);
    }
  }

  return Array.from(matchedTags);
}

export async function shouldDispatch(
  message: TSignCallbackMessage,
  config: { tags: TagValue[]; matchRules: TagMatchRule[]; msgTypes?: string[]; unknownMsgTypePolicy?: UnknownMsgTypePolicy; builtInTagMissPolicy?: BuiltInTagMissPolicy }
): Promise<boolean> {
  // Check message type filter
  if (config.msgTypes && config.msgTypes.length > 0) {
    const isKnownType = ALL_KNOWN_MSG_TYPES.has(message.MsgType);

    if (!isKnownType) {
      const policy = config.unknownMsgTypePolicy || 'dispatch';
      if (policy === 'discard') {
        logger.debug(`Unknown MsgType "${message.MsgType}" discarded by policy for config`);
        return false;
      }
      logger.debug(`Unknown MsgType "${message.MsgType}" dispatched by policy`);
    } else {
      if (!config.msgTypes.includes(message.MsgType)) {
        return false;
      }
    }
  }

  // If no tags configured, dispatch all
  if (config.tags.length === 0 && config.matchRules.length === 0) {
    return true;
  }

  // 内置标签直接从消息字段匹配（FlowType/UserData 等）
  const tagsConfig = await getTagsConfig();
  const tagDefMap = new Map(tagsConfig.tags.map((t) => [t.key, t]));

  if (config.tags.length > 0) {
    for (const configTag of config.tags) {
      const tagDef = tagDefMap.get(configTag.key);

      // 内置标签：通过 fieldPath 直接从消息中取值比较
      if (tagDef?.builtIn && tagDef.fieldPath) {
        const msgValue = getNestedValue(message, tagDef.fieldPath);

        // 消息中不包含该字段或字段为空 → 根据 builtInTagMissPolicy 决定
        // UserData 等字段存在但值为空字符串时，等效于不存在
        const fieldMissing = msgValue === undefined || msgValue === null || String(msgValue).trim() === '';
        if (fieldMissing) {
          const missPolicy = config.builtInTagMissPolicy || 'dispatch';
          if (missPolicy === 'discard') {
            logger.debug(`Built-in tag "${configTag.key}" field missing or empty in message, discarded by policy`);
            return false;
          }
          // missPolicy === 'dispatch' → 放行缺失/空值字段的消息
          logger.debug(`Built-in tag "${configTag.key}" field missing or empty in message, dispatched by policy`);
          continue;
        }

        // 配置了具体值则精确匹配，空值表示只要字段存在即可
        if (configTag.value && String(msgValue) !== configTag.value) {
          logger.debug(`Built-in tag "${configTag.key}" value mismatch: expected="${configTag.value}", got="${msgValue}"`);
          return false;
        }

        logger.debug(`Built-in tag "${configTag.key}" matched: value="${msgValue}"`);
        continue;
      }

      // 非内置标签：走 matchRules 逻辑
    }
  }

  // Match tags from rules
  const messageTags = matchTags(message, config.matchRules);

  // 如果只有内置标签（无 matchRules 且内置标签已全部通过），放行
  if (config.matchRules.length === 0) {
    return true;
  }

  // Check if any matched tag is in the config tags (compare by tag key)
  if (config.tags.length === 0) {
    return messageTags.length > 0;
  }

  // 非内置标签需要通过 matchRules 匹配
  const nonBuiltInTagKeys = config.tags
    .filter((t) => {
      const td = tagDefMap.get(t.key);
      return !td?.builtIn;
    })
    .map((t) => t.key);

  if (nonBuiltInTagKeys.length === 0) {
    return true; // 只有内置标签且已全部通过
  }

  return nonBuiltInTagKeys.some((key) => messageTags.includes(key));
}
