import { defineConfig } from 'vitepress'

const rootSidebar = [
  {
    text: '入口',
    items: [
      { text: '首页', link: '/' },
      { text: '索引', link: '/index/' },
      { text: 'Inbox', link: '/inbox/' },
      { text: 'Reviews', link: '/reviews/' },
      { text: 'Archive', link: '/archive/' }
    ]
  }
]

const indexSidebar = [
  {
    text: '索引',
    items: [
      { text: '索引首页', link: '/index/' },
      { text: 'Agent 系统学习索引', link: '/index/Agent 系统学习索引' }
    ]
  }
]

const topicsSidebar = [
  {
    text: 'Topics',
    items: [
      { text: 'Topics 首页', link: '/topics/' },
      {
        text: 'Agent',
        collapsed: true,
        items: [
          { text: 'Agent 首页', link: '/topics/agent/' },
          { text: '上下文管理', link: '/topics/agent/上下文管理' },
          { text: 'Agent Session 字段', link: '/topics/agent/Agent Session 字段' },
          {
            text: 'Security',
            collapsed: true,
            items: [
              { text: 'Security 首页', link: '/topics/agent/security/' },
              { text: '提示词攻击测试方案', link: '/topics/agent/security/提示词攻击测试方案' },
              { text: 'Agent 提示词攻击测试流程', link: '/topics/agent/security/Agent 提示词攻击测试流程' },
              { text: 'AstrBot Agent 沙箱调研', link: '/topics/agent/security/AstrBot-Agent-沙箱调研' }
            ]
          }
        ]
      },
      {
        text: 'LLM',
        collapsed: false,
        items: [
          { text: 'LLM 首页', link: '/topics/llm/' },
          { text: '大模型的主要部分', link: '/topics/llm/大模型的主要部分' },
          { text: 'Transformer 架构', link: '/topics/llm/大模型的 Transformer 架构' },
          { text: '手撕注意力机制', link: '/topics/llm/手撕注意力机制' },
          { text: 'DeepSeek HTTP payload', link: '/topics/llm/DeepSeek HTTP payload 结构' },
          {
            text: 'Pretraining',
            collapsed: false,
            items: [
              { text: '预训练首页', link: '/topics/llm/pretraining/' },
              { text: '预训练数据格式', link: '/topics/llm/pretraining/预训练数据格式' },
              { text: 'Tokenizer 与 Embedding 的关系', link: '/topics/llm/pretraining/Tokenizer 与 Embedding 的关系' },
              { text: '预训练的自监督形式', link: '/topics/llm/pretraining/预训练的自监督形式' },
              { text: 'nanochat 学习路径', link: '/topics/llm/pretraining/nanochat 预训练学习路径' },
              { text: 'Validation BPB 指标', link: '/topics/llm/pretraining/Validation BPB 指标' }
            ]
          },
          {
            text: 'QLoRA',
            collapsed: true,
            items: [
              { text: 'QLoRA 首页', link: '/topics/llm/QLoRA/' },
              { text: 'QLoRA 的概念', link: '/topics/llm/QLoRA/QLoRA 的概念' },
              { text: 'LoRA 的概念', link: '/topics/llm/QLoRA/LoRA 的概念' }
            ]
          }
        ]
      },
      {
        text: 'AI Coding',
        collapsed: true,
        items: [
          { text: 'AI Coding 首页', link: '/topics/ai-coding/' },
          { text: 'AI Coding 实践心得', link: '/topics/ai-coding/AI Coding 实践心得' },
          { text: '渐进式披露', link: '/topics/ai-coding/渐进式披露' },
          { text: '参考资料笔记', link: '/topics/ai-coding/参考资料笔记' }
        ]
      },
      {
        text: 'Learning',
        collapsed: true,
        items: [
          { text: 'Learning 首页', link: '/topics/learning/' },
          { text: '快速学习', link: '/topics/learning/快速学习' },
          { text: '主动输出的能力', link: '/topics/learning/主动输出的能力' }
        ]
      },
      {
        text: 'Software Engineering',
        collapsed: true,
        items: [
          { text: '软件工程首页', link: '/topics/software-engineering/' },
          { text: '软件工程', link: '/topics/software-engineering/软件工程' },
          { text: '架构思维总结', link: '/topics/software-engineering/架构思维总结' },
          { text: '架构演进关键阶段', link: '/topics/software-engineering/架构演进关键阶段' },
          { text: '工程程序设计经验总结', link: '/topics/software-engineering/工程程序设计经验总结' },
          { text: '日志细节', link: '/topics/software-engineering/日志细节' }
        ]
      },
      {
        text: 'Algorithms',
        collapsed: true,
        items: [
          { text: 'Algorithms 首页', link: '/topics/algorithms/' },
          {
            text: 'Clustering',
            collapsed: true,
            items: [
              { text: 'Clustering 首页', link: '/topics/algorithms/clustering/' },
              { text: '聚类算法', link: '/topics/algorithms/clustering/聚类算法' },
              { text: '聚类算法工程实现', link: '/topics/algorithms/clustering/聚类算法工程实现' },
              { text: '增量聚类改造方案', link: '/topics/algorithms/clustering/增量聚类改造方案' },
              { text: '其他项目使用的算法', link: '/topics/algorithms/clustering/其他项目使用的算法' }
            ]
          }
        ]
      }
    ]
  }
]

const projectsSidebar = [
  {
    text: 'Projects',
    items: [
      { text: 'Projects 首页', link: '/projects/' },
      {
        text: 'Hermes',
        collapsed: false,
        items: [
          { text: 'Hermes 首页', link: '/projects/hermes/' },
          {
            text: 'Concepts',
            collapsed: true,
            items: [
              { text: 'Concepts 首页', link: '/projects/hermes/concepts/' },
              { text: 'Agent Swarm 协作方式', link: '/projects/hermes/concepts/Agent Swarm 协作方式' }
            ]
          },
          {
            text: 'Architecture',
            collapsed: false,
            items: [
              { text: 'Architecture 首页', link: '/projects/hermes/architecture/' },
              { text: 'Agent 工程模式提炼', link: '/projects/hermes/architecture/Hermes Agent 工程模式提炼' },
              { text: '架构优秀设计提炼', link: '/projects/hermes/architecture/Hermes 架构优秀设计提炼' },
              { text: '面试八股提炼', link: '/projects/hermes/architecture/Hermes 面试八股提炼' }
            ]
          },
          {
            text: 'Kanban',
            collapsed: true,
            items: [
              { text: 'Kanban 首页', link: '/projects/hermes/kanban/' },
              { text: 'Hermes Kanban 核心概念', link: '/projects/hermes/kanban/Hermes Kanban 核心概念' },
              { text: 'Kanban 使用场景', link: '/projects/hermes/kanban/Kanban 使用场景' },
              { text: 'Worker Lane 与任务执行', link: '/projects/hermes/kanban/Worker Lane 与任务执行' },
              { text: 'Worker 心跳与任务租约', link: '/projects/hermes/kanban/Worker 心跳与任务租约' },
              { text: '多 Gateway 与 Dispatcher 部署', link: '/projects/hermes/kanban/多 Gateway 与 Dispatcher 部署' },
              { text: '多 Agent 协作', link: '/projects/hermes/kanban/多 Agent 协作' }
            ]
          }
        ]
      }
    ]
  }
]

const referenceSidebar = [
  {
    text: 'Reference',
    items: [
      { text: 'Reference 首页', link: '/reference/' },
      { text: 'Repos', link: '/reference/repos/' }
    ]
  }
]

const inboxSidebar = [
  {
    text: 'Inbox',
    items: [{ text: 'Inbox 首页', link: '/inbox/' }]
  }
]

const siteSidebar = [
  ...rootSidebar,
  ...topicsSidebar,
  ...projectsSidebar,
  ...referenceSidebar
]

export default defineConfig({
  title: 'Notes',
  description: '个人长期笔记库',
  base: '/notes/',
  outDir: 'site',
  cleanUrls: true,
  rewrites: (id) => id.replace(/(^|\/)README\.md$/, '$1index.md'),
  srcExclude: [
    'AGENTS.md',
    '**/AGENTS.md',
    'private/**',
    'site/**',
    '.mkdocs/**',
    'node_modules/**',
    'projects/hermes/reference/**',
    'reference/repos/vibe-coding-cn/**'
  ],
  ignoreDeadLinks: true,
  themeConfig: {
    logo: '/favicon.svg',
    siteTitle: 'Notes',
    search: {
      provider: 'local'
    },
    nav: [
      { text: '首页', link: '/' },
      { text: '索引', link: '/index/' },
      { text: 'Topics', link: '/topics/' },
      { text: 'Projects', link: '/projects/' },
      { text: 'Reference', link: '/reference/' },
      { text: 'Inbox', link: '/inbox/' }
    ],
    sidebar: siteSidebar,
    socialLinks: [
      { icon: 'github', link: 'https://github.com/mousebar01/notes' }
    ],
    footer: {
      message: 'Personal notes and working knowledge.',
      copyright: 'Copyright © 2026-present'
    }
  }
})
