# VideoAgent 功能能力矩阵

能力矩阵（6 大类，19 种意图）
🎥 一、视频理解（Understanding）
功能	意图名	具体做什么
视频问答	Video QA	对视频文件夹自由提问，基于 Whisper 转录 + GPT-4o 回答
视频摘要	Audio Overview	对视频内容生成摘要/概述
✂️ 二、视频编辑（Editing）
功能	意图名	具体做什么
视频混剪	Video Edit	语义检索匹配片段 + 节拍对齐 + 自动剪辑成片
📝 三、视频创作 — 从文本生成视频（Creation）
功能	意图名	具体做什么
解说视频	Commentary	长文本 → GPT-4o 写解说词 → CosyVoice2 配音 → 检索匹配画面 → 剪辑成片
新闻播报	News	新闻文本 → 生成播报视频
节奏剪辑	Rhythm-cut	按音频节拍自动卡点剪辑
🎤 四、音频处理（Audio Processing）
功能	意图名	具体做什么
响度归一化	Loudness Normalization	统一音频响度
音频重采样	Audio Resample	转换采样率
人声分离	Vocal Separation	demucs 分离人声/伴奏
音频优化	Audio Optimization	一键：归一化+重采样
音频剪切	Audio Slice	按时间戳剪切音频
添加 BGM	Add BGM	混合背景音乐
视频提取音频	Video to Audio	ffmpeg 提取音轨
音频转录	Audio Transcription	Whisper/FunASR 转录
🎭 五、创意改编（Creative Remaking）
功能	意图名	具体做什么
TTS 改写	Text-to-Speech	改写原视频台词 + Fish-Speech 合成新语音 + 替换原始音轨
歌词改编翻唱	Singing Voice Conversion	MIDI 解析 → LLM 改歌词 → DiffSinger 合成歌声 → Seed-VC 音色克隆
脱口秀	Stand-up Comedy	LLM 改脚本 → CosyVoice2 合成+反应音效 → 生成视频
相声	CrossTalk	LLM 改脚本 → CosyVoice2 双角色(逗/捧)合成 → 生成视频
🎨 六、格式转换
功能	意图名	具体做什么
创意写作	Creative Writing	LLM 写作辅助
格式转换	Format Conversion	各创意子图的输出 → 统一为 VideoEditor 可用的场景描述格式
你说对了一半
你说的"两个"大致对应了视频理解和视频创作，但这个项目的完整能力实际上是 6 大类：


视频理解（问答 + 摘要）
    ↓ 基础
视频编辑（语义混剪）
    ↓ 应用
视频创作（解说/新闻/节奏剪辑）
    ↓ 扩展
创意改编（TTS 改写/歌词翻唱/脱口秀/相声）
    ↓ 支持
音频处理（归一化/重采样/分离/转录/BGM）
    ↓ 桥梁
格式转换（子图输出 → 统一流水线）
核心区别在于复杂度：

最简单的：Video to Audio（一条 ffmpeg 命令）
最复杂的：Video Edit / Commentary（涉及 VideoRAG 检索 + Gemini 帧分析 + CosyVoice2 配音 + 多模态剪辑，串联了 6 个 agent）
要具体跑哪个功能试试？可以从最简单的 Audio Overview（视频摘要）开始验证整个 Agent Loop 能跑通。