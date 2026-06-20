import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Notes',
  description: '个人长期笔记库',
  base: '/notes/',
  outDir: 'site',
  cleanUrls: true,
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
    sidebar: {
      '/topics/llm/pretraining/': [
        {
          text: '大模型预训练',
          items: [
            { text: '专题首页', link: '/topics/llm/pretraining/' },
            { text: '预训练数据格式', link: '/topics/llm/pretraining/预训练数据格式' },
            { text: 'Tokenizer 与 Embedding', link: '/topics/llm/pretraining/Tokenizer 与 Embedding' },
            { text: '预训练的自监督形式', link: '/topics/llm/pretraining/预训练的自监督形式' },
            { text: 'nanochat 预训练学习路径', link: '/topics/llm/pretraining/nanochat 预训练学习路径' },
            { text: 'Validation bpb 指标', link: '/topics/llm/pretraining/Validation bpb 指标' }
          ]
        }
      ],
      '/topics/llm/': [
        {
          text: 'LLM',
          items: [
            { text: 'LLM 首页', link: '/topics/llm/' },
            { text: '大模型预训练', link: '/topics/llm/pretraining/' },
            { text: 'QLoRA', link: '/topics/llm/QLoRA/' },
            { text: '大模型的主要部分', link: '/topics/llm/大模型的主要部分' },
            { text: '大模型的 Transformer 架构', link: '/topics/llm/大模型的 Transformer 架构' },
            { text: 'DeepSeek HTTP payload 结构', link: '/topics/llm/DeepSeek HTTP payload 结构' }
          ]
        }
      ],
      '/topics/': [
        {
          text: 'Topics',
          items: [
            { text: 'Topics 首页', link: '/topics/' },
            { text: 'Agent', link: '/topics/agent/' },
            { text: 'LLM', link: '/topics/llm/' },
            { text: 'AI Coding', link: '/topics/ai-coding/' },
            { text: 'Software Engineering', link: '/topics/software-engineering/' },
            { text: 'Algorithms', link: '/topics/algorithms/' }
          ]
        }
      ],
      '/projects/hermes/': [
        {
          text: 'Hermes',
          items: [
            { text: '项目首页', link: '/projects/hermes/' },
            { text: '核心概念', link: '/projects/hermes/concepts/' },
            { text: 'Kanban', link: '/projects/hermes/kanban/' }
          ]
        }
      ],
      '/projects/': [
        {
          text: 'Projects',
          items: [
            { text: 'Projects 首页', link: '/projects/' },
            { text: 'Hermes', link: '/projects/hermes/' }
          ]
        }
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Reference 首页', link: '/reference/' },
            { text: 'Articles', link: '/reference/articles/' },
            { text: 'Docs', link: '/reference/docs/' },
            { text: 'Papers', link: '/reference/papers/' },
            { text: 'Repos', link: '/reference/repos/' }
          ]
        }
      ],
      '/index/': [
        {
          text: '索引',
          items: [
            { text: '索引首页', link: '/index/' },
            { text: 'Agent 系统学习索引', link: '/index/Agent 系统学习索引' }
          ]
        }
      ],
      '/': [
        {
          text: '入口',
          items: [
            { text: '首页', link: '/' },
            { text: '索引', link: '/index/' },
            { text: 'Topics', link: '/topics/' },
            { text: 'Projects', link: '/projects/' },
            { text: 'Reference', link: '/reference/' },
            { text: 'Inbox', link: '/inbox/' },
            { text: 'Reviews', link: '/reviews/' },
            { text: 'Archive', link: '/archive/' }
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/mousebar01/notes' }
    ],
    footer: {
      message: 'Personal notes and working knowledge.',
      copyright: 'Copyright © 2026-present'
    }
  }
})
