架构设计

                          MultiAgent（编排器）
                               │
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
    意图分析 (Claude)    Graph设计 (Claude)    评估反思 (Claude)
          │                    │                    │
          │              ┌─────▼─────┐              │
          │              │ 设计出的  │              │
          │              │ DAG执行图 │◄─────────────┘
          │              └─────┬─────┘
          │                    │
          ▼                    ▼
    ┌─────────────────────────────────────────┐
    │         execute_agent_chain()            │
    │                                          │
    │  Agent1 ──data──► Agent2 ──data──► Agent3 │
    │     (VideoPreloader → VideoSearcher → ...) │
    │                                          │
    │  context["Agent.out"] → context["Next.in"] │
    └─────────────────────────────────────────┘
33 个独立 Agent，动态组合
每次请求临时设计并执行一条 agent 流水线，不是硬编码的。过程是：

注册中心 (registry.json) 列出 33 个可用 agent 的类路径
意图表 (intents.yml) 定义 19 种意图各自需要哪些 agent
Claude 根据你的需求 + 候选 agent 的元数据（输入输出 schema），动态设计一个 DAG
执行器 按链依次实例化每个 agent，通过 context 字典传递数据
例如你说「帮我剪个视频」，Claude 自动生成的图可能是：


User Input: video_dir, bgm_path, requirements
    │
    ▼
VideoPreloader (索引视频 → VideoRAG)
    │
    ▼
VideoSearcher (场景描述 → 检索匹配片段)
    │
    ▼
VoiceGenerator (生成解说音频 + 时间戳)
    │
    ▼
VideoEditor (片段 + 时间戳 → 最终剪辑)
    │
    ▼
User Output: dataset/final.mp4
而你说「把这首歌改成我唱的」，Claude 会生成完全不同的链：


SVCAnalyzer → SVCAdapter → SVCSingle → SVCCoverist → SVCConversion → VideoEditor
同一入口，不同流水线
关键代码在 environment/agents/multi.py 的 run() 方法：


def run(self):
    requirement = input("User Requirement: ")   # 同一个入口
    agent_data = self.process_requirement(requirement)  # 动态分析+设计
    self.execute_agent_chain(...)               # 执行定制流水线
所以可以说：入口是统一的，但执行的是按需拼装的 33-agent 组合。这不是一个"万能 agent"，而是一个"agent 指挥官"——每次根据任务临时组建一支特种小队。