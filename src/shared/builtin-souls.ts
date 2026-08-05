export interface BuiltinSoulTemplate {
  id: string
  name: string
  description: string
  category: string
  tags: readonly string[]
  filename: string
}

export interface BuiltinSoulTemplateWithContent extends BuiltinSoulTemplate {
  content: string
}

export const DEFAULT_BUILTIN_SOUL_TEMPLATE_ID = 'grid-general-collaborator'

export const BUILTIN_SOUL_TEMPLATES: readonly BuiltinSoulTemplate[] = [
  {
    id: 'grid-general-collaborator',
    name: '电网通用协作者',
    description: '覆盖安监、基建、物资及其他专业条线的稳健默认人格,清单化办事,口径有脚注。',
    category: 'grid',
    tags: ['safety-supervision', 'infrastructure', 'materials'],
    filename: 'grid-general-collaborator.md'
  },
  {
    id: 'grid-marketing-assistant',
    name: '营销客服助手',
    description: '面向营业厅柜员与客服的人格:业务口径准确,对客户与对内两副面孔切换干净。',
    category: 'grid',
    tags: ['customer-service', 'billing-policy'],
    filename: 'grid-marketing-assistant.md'
  },
  {
    id: 'grid-station-manager',
    name: '台区经理助手',
    description: '懂线损治理、催费停复电与各类填报的老搭档,帮台区经理少填表、少跑腿、少背锅。',
    category: 'grid',
    tags: ['station-area', 'line-loss'],
    filename: 'grid-station-manager.md'
  },
  {
    id: 'grid-dispatch-partner',
    name: '调度运检伙伴',
    description: '最保守的人格:设备与电网状态判断一律标注数据来源,绝不代写操作票。',
    category: 'grid',
    tags: ['dispatch', 'maintenance'],
    filename: 'grid-dispatch-partner.md'
  },
  {
    id: 'grid-document-officer',
    name: '公文写作专员',
    description: '文种、结构、语体一次到位的公文人格:动笔前三问,引文带文号,绝不编造。',
    category: 'grid',
    tags: ['official-document', 'writing'],
    filename: 'grid-document-officer.md'
  },
  {
    id: 'grid-ledger-keeper',
    name: '台账管家',
    description: '敬畏原表的填报人格:先描述表结构、只动目标单元格、改完报 diff。',
    category: 'grid',
    tags: ['ledger', 'reporting'],
    filename: 'grid-ledger-keeper.md'
  },
  {
    id: 'grid-data-analyst',
    name: '数据分析师',
    description: '先对齐指标口径再出数,异动归因分层排查,每个关键数字可追溯。',
    category: 'grid',
    tags: ['metrics', 'data-query'],
    filename: 'grid-data-analyst.md'
  },
  {
    id: 'balanced-collaborator',
    name: 'Balanced Professional Collaborator',
    description:
      'A steady default persona for mixed daily work, thoughtful discussion, and general assistance.',
    category: 'general',
    tags: ['daily', 'balanced', 'clear'],
    filename: 'balanced-collaborator.md'
  },
  {
    id: 'senior-engineering-partner',
    name: 'Senior Software Engineering Partner',
    description:
      'A rigorous programming persona for reading code, making scoped changes, debugging, reviews, and technical decisions.',
    category: 'coding',
    tags: ['programming', 'debugging', 'review'],
    filename: 'senior-engineering-partner.md'
  },
  {
    id: 'daily-life-assistant',
    name: 'Daily Life Assistant',
    description:
      'A pragmatic everyday persona for planning, reminders, decisions, messages, travel, learning, and personal organization.',
    category: 'daily',
    tags: ['planning', 'organization', 'everyday'],
    filename: 'daily-life-assistant.md'
  },
  {
    id: 'emotionally-attuned-companion',
    name: 'Emotionally Attuned Companion',
    description:
      'A careful emotional support persona for reflective conversation, relationship wording, and difficult moments.',
    category: 'emotional',
    tags: ['emotional support', 'reflection', 'relationships'],
    filename: 'emotionally-attuned-companion.md'
  },
  {
    id: 'research-writing-strategist',
    name: 'Research and Writing Strategist',
    description:
      'A precise persona for research synthesis, writing plans, editing, argument quality, and source-aware work.',
    category: 'research',
    tags: ['research', 'writing', 'editing'],
    filename: 'research-writing-strategist.md'
  },
  {
    id: 'product-strategy-operator',
    name: 'Product Strategy Operator',
    description:
      'A product and business persona for prioritization, UX tradeoffs, launch planning, and operational clarity.',
    category: 'business',
    tags: ['product', 'strategy', 'operations'],
    filename: 'product-strategy-operator.md'
  }
]
