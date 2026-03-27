import { AppType } from '../types/api.types';

export interface CallbackEventItem {
  label: string;
  value: string;
}

export interface CallbackEventCategory {
  category: string;
  docUrl?: string;
  events: CallbackEventItem[];
}

// ==================== 自建应用回调事件 ====================
const COMPANY_EVENTS: CallbackEventCategory[] = [
  {
    category: '合同相关回调',
    docUrl: 'https://qian.tencent.com/developers/company/callback_types_contracts_sign',
    events: [
      { label: '合同状态变动通知', value: 'FlowStatusChange' },
      { label: '合同发起扣费通知（已废弃）', value: 'FlowCost' },
      { label: '合同转交通知', value: 'ForwardFLow' },
      { label: '发起合同审核通知', value: 'CreateFlowReview' },
      { label: '或签/动态签署人领取合同通知', value: 'ReceiveFlow' },
      { label: '签署人签署截止时间过期通知', value: 'ApproverDeadlineExpired' },
      { label: '批量撤销结果回调', value: 'CancelFlows' },
      { label: '合同文档合成完成回调', value: 'DocumentFill' },
      { label: '合同组状态变动回调', value: 'FlowGroupStatusChange' },
      { label: '关注方合同已读回调通知', value: 'ReviewerFlowRead' },
    ],
  },
  {
    category: '印章相关回调',
    docUrl: 'https://qian.tencent.com/developers/company/callback_types_seals',
    events: [
      { label: '印章操作回调通知', value: 'OperateSeal' },
      { label: '员工执业章回调通知', value: 'EmployeeSealAuth' },
      { label: '用印记录回调通知', value: 'SealUse' },
    ],
  },
  {
    category: '模板相关回调',
    docUrl: 'https://qian.tencent.com/developers/company/callback_types_templates',
    events: [
      { label: '创建模板通知', value: 'TemplateAdd' },
      { label: '编辑模板通知', value: 'TemplateUpdate' },
      { label: '删除模板通知', value: 'TemplateDelete' },
      { label: '启用或停用模板通知', value: 'TemplateAvailable' },
    ],
  },
  {
    category: '企业员工相关回调',
    docUrl: 'https://qian.tencent.com/developers/company/callback_types_staffs',
    events: [
      { label: '员工变更角色回调通知', value: 'RolesChange' },
      { label: '审批员工加入成功回调通知', value: 'ApproveEmployeeJoin' },
      { label: '员工离职回调通知', value: 'QuiteJob' },
      { label: '企业超管变更回调通知', value: 'SuperAdminChange' },
      { label: '企业基础信息变更回调通知', value: 'ModifyOrganizationBaseInfo' },
      { label: '企业注销回调通知', value: 'CloseOrganization' },
      { label: '集团子企业加入回调通知', value: 'SubOrganizationJoinOrganizationGroup' },
      { label: '集团子企业解除回调通知', value: 'UnbindOrganizationGroup' },
      { label: '企业拓展服务操作回调', value: 'OperateExtendedService' },
      { label: '企业引导企业实名认证后回调', value: 'CreateOrganization' },
      { label: '企业引导个人实名认证后回调', value: 'UserAccountVerify' },
      { label: '个人/员工手机号修改后回调', value: 'UserMobileChange' },
      { label: '认证流创建/失效回调', value: 'OrganizationAuthorization' },
      { label: '授权书上传回调', value: 'OrgAuthorizationFileSubmit' },
      { label: '授权书认证审核结果回调', value: 'OrganizationAuthorizationFileReview' },
      { label: '授权书失效回调', value: 'OrgAuthorizationFileInvalid' },
      { label: '企业引导个人更名后回调', value: 'UserNameChange' },
    ],
  },
  {
    category: '其他功能回调',
    docUrl: 'https://qian.tencent.com/developers/company/callback_types_commons',
    events: [
      { label: '一码多签发起合同失败通知', value: 'CreateFlowByQrCode' },
      { label: '一码多签发起合同消费通知', value: 'MultiFlowSignQrCodeCost' },
      { label: '他方静默签授权通知', value: 'PartnerServerSignAuthorization' },
    ],
  },
  {
    category: '费用相关回调',
    docUrl: 'https://qian.tencent.com/developers/company/callback_types_billing',
    events: [
      { label: '扣费回调通知', value: 'BillingUse' },
    ],
  },
  {
    category: '个人医疗自动签回调',
    docUrl: 'https://qian.tencent.com/developers/company/callback_types_userautosign',
    events: [
      { label: '开通医疗自动签回调通知', value: 'OpenUserAutoSign' },
      { label: '创建自动签署印章签名回调', value: 'AutoSignSealImg' },
      { label: '关闭医疗自动签回调通知', value: 'DisableUserAutoSign' },
      { label: '撤销医疗自动签回调通知', value: 'CancelUserAutoSign' },
    ],
  },
  {
    category: '合同智能相关回调',
    docUrl: 'https://qian.tencent.com/developers/company/callback_types_riskident_lm',
    events: [
      { label: '合同风险审查回调通知', value: 'AIContractReview' },
      { label: '合同智能提取回调通知', value: 'AIInformationExtraction' },
    ],
  },
  {
    category: '合同对比相关回调',
    docUrl: 'https://qian.tencent.com/developers/company/callback_types_contractdiff',
    events: [
      { label: '合同对比完成回调', value: 'ContractDiffTaskFinish' },
      { label: '合同对比创建回调', value: 'ContractDiffTaskCreate' },
    ],
  },
];

// ==================== 第三方应用回调事件 ====================
const PARTNER_EVENTS: CallbackEventCategory[] = [
  {
    category: '合同相关回调',
    docUrl: 'https://qian.tencent.com/developers/partner/callback_types_contracts_sign',
    events: [
      { label: '合同状态变动通知', value: 'FlowStatusChange' },
      { label: '合同发起扣费通知（已废弃）', value: 'FlowCost' },
      { label: '合同转交通知', value: 'ForwardFLow' },
      { label: '发起合同审核通知', value: 'CreateFlowReview' },
      { label: '动态签署人/领取未归属合同通知', value: 'ReceiveFlow' },
      { label: '签署人签署截止时间过期通知', value: 'ApproverDeadlineExpired' },
      { label: '批量撤销结果回调', value: 'CancelFlows' },
      { label: '合同文档合成完成回调', value: 'DocumentFill' },
      { label: '合同组状态变动回调', value: 'FlowGroupStatusChange' },
    ],
  },
  {
    category: '印章相关回调',
    docUrl: 'https://qian.tencent.com/developers/partner/callback_types_seals',
    events: [
      { label: '印章操作回调通知', value: 'OperateSeal' },
      { label: '印章审核结果通知', value: 'AuditSealAuth' },
      { label: '用印申请审批状态通知', value: 'SealPolicyWorkflow' },
      { label: '员工执业章回调通知', value: 'EmployeeSealAuth' },
    ],
  },
  {
    category: '模板相关回调',
    docUrl: 'https://qian.tencent.com/developers/partner/callback_types_templates',
    events: [
      { label: '模板新增通知', value: 'TemplateAdd' },
      { label: '模板修改通知', value: 'TemplateUpdate' },
      { label: '模板删除通知', value: 'TemplateDelete' },
      { label: '启用或停用模板通知', value: 'TemplateAvailable' },
    ],
  },
  {
    category: '企业员工相关回调',
    docUrl: 'https://qian.tencent.com/developers/partner/callback_types_staffs',
    events: [
      { label: '平台企业授权电子签通知', value: 'OrgAuth' },
      { label: '认证流创建/失效回调', value: 'OrganizationAuthorization' },
      { label: '授权书上传回调', value: 'OrgAuthorizationFileSubmit' },
      { label: '授权书审核结果回调', value: 'OrgCertify' },
      { label: '授权书失效回调', value: 'OrgAuthorizationFileInvalid' },
      { label: '对公打款状态变更回调', value: 'OrgAuthorizationPaymentStatusChange' },
      { label: '企业开通电子签服务通知', value: 'OrgOpenTsignBiz' },
      { label: '企业收录申请审核结果回调', value: 'OrgAuthAudit' },
      { label: '员工加入企业通知', value: 'VerifyStaffInfo' },
      { label: '员工加入企业失败通知', value: 'VerifyStaffFail' },
      { label: '经办人授权通知', value: 'OperatorAuth' },
      { label: '超管变更通知', value: 'SuperAdminChange' },
      { label: '员工变更角色通知', value: 'RolesChange' },
      { label: '员工离职回调通知', value: 'QuiteJob' },
      { label: '法人加入变更通知', value: 'LegalPersonChangeOpenId' },
      { label: '企业基础信息修改通知', value: 'ModifyOrganizationBaseInfo' },
      { label: '企业注销通知', value: 'CloseOrganization' },
      { label: '企业拓展服务操作回调', value: 'OperateExtendedService' },
    ],
  },
  {
    category: '其他功能回调',
    docUrl: 'https://qian.tencent.com/developers/partner/callback_types_commons',
    events: [
      { label: '签署二维码发起合同失败通知', value: 'CreateFlowByQrCode' },
      { label: '签署二维码发起合同消费通知', value: 'MultiFlowSignQrCodeCost' },
      { label: '他方自动签授权/子客授权平台通知', value: 'PartnerServerSignAuthorization' },
    ],
  },
  {
    category: '费用相关回调',
    docUrl: 'https://qian.tencent.com/developers/partner/callback_types_billing',
    events: [
      { label: '扣费回调通知', value: 'BillingUse' },
    ],
  },
  {
    category: '个人医疗自动签回调',
    docUrl: 'https://qian.tencent.com/developers/partner/callback_types_userautosign',
    events: [
      { label: '开通医疗自动签回调通知', value: 'OpenUserAutoSign' },
      { label: '创建自动签署印章签名回调', value: 'AutoSignSealImg' },
      { label: '关闭医疗自动签回调通知', value: 'DisableUserAutoSign' },
      { label: '撤销医疗自动签回调通知', value: 'CancelUserAutoSign' },
    ],
  },
  {
    category: '合同智能相关回调',
    docUrl: 'https://qian.tencent.com/developers/partner/callback_types_riskident',
    events: [
      { label: '合同风险审查完成回调通知', value: 'FlowRiskIdentify' },
    ],
  },
];

export function getEventCategories(appType: AppType): CallbackEventCategory[] {
  return appType === 'company' ? COMPANY_EVENTS : PARTNER_EVENTS;
}

export function getAllEventValues(appType: AppType): string[] {
  return getEventCategories(appType).flatMap((c) => c.events.map((e) => e.value));
}

export function getEventLabel(value: string, appType: AppType): string | undefined {
  for (const cat of getEventCategories(appType)) {
    const found = cat.events.find((e) => e.value === value);
    if (found) return found.label;
  }
  return undefined;
}

/** 获取所有已知事件值（自建+第三方合集），用于判断未知事件 */
export function getAllKnownEventValues(): string[] {
  const companyVals = COMPANY_EVENTS.flatMap((c) => c.events.map((e) => e.value));
  const partnerVals = PARTNER_EVENTS.flatMap((c) => c.events.map((e) => e.value));
  return Array.from(new Set([...companyVals, ...partnerVals]));
}
