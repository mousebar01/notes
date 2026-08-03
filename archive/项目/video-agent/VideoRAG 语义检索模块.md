# VideoRAG 语义检索模块

> 来源：基于上游 VideoAgent / VideoRAG 代码的既有阅读笔记；未记录仓库 URL 与 commit。
>
> 采用状态：作为暂定主线的 retrieval 层候选实现。
>
> 验证状态：本文列出的路径、默认 `10s` 切片和模型组合需要对照当前源码复核；完整索引与检索链是否已跑通，待确认。

VideoRAG 在这个项目里不是“视频生成”或“自动剪辑”本身，而是一个 **视频素材语义检索模块**。它的核心作用是：先把视频素材切成片段并建立多模态索引，然后根据文本场景描述，找出最匹配的视频片段。

**核心流程**

1. 素材预处理  
   `VideoPreloader` 读取一个视频目录里的 `.mp4`，调用 `VideoRAG.insert_video()` 建索引。

2. 视频切片  
   每个视频会被切成固定长度片段，当前默认是 `10s` 一段。每段都会保存音频、视频片段和时间范围。

3. 文本转写  
   每个片段的音频用 Whisper 做 ASR，得到片段 transcript。

4. 视觉描述  
   每个片段抽取若干帧，调用多模态模型生成视觉 caption，用来描述画面内容。

5. 向量索引  
   使用 ImageBind 对视频片段做视觉 embedding，写入本地向量库 `NanoVectorDB`。

6. 场景检索  
   `VideoSearcher` 读取 `video_scene.json` 里的 `segment_scene`，按 `/////` 拆成多个场景查询，再逐个查询相似片段。

7. 结果输出  
   检索结果写到：

```text
dataset/video_edit/scene_output/visual_retrieved_segments.json
dataset/video_edit/scene_output/textual_segmentations.json
```

**关键文件**

- `environment/roles/vid_preloader.py`  
  负责素材预处理入口。

- `environment/roles/vid_searcher.py`  
  负责按场景描述查询视频片段。

- `tools/videorag/videoragcontent.py`  
  VideoRAG 主流程：切片、ASR、caption、向量化、查询。

- `tools/videorag/_opcontent.py`  
  具体检索逻辑：拆分场景、查询向量库、过滤片头片尾、去重、输出结果。

- `tools/videorag/_videoutil/split.py`  
  视频切片与音频提取。

- `tools/videorag/_videoutil/asr.py`  
  Whisper 转写。

- `tools/videorag/_videoutil/caption.py`  
  多模态 caption。

- `tools/videorag/_videoutil/feature.py`  
  ImageBind embedding。

**适合的产品能力**

VideoRAG 更适合做这些功能：

- 素材库语义检索
- 根据脚本/场景找素材片段
- 高光片段推荐
- 章节关键画面推荐
- 视觉问答
- 多视频主题片段聚合
- 辅助剪辑规划

**对视频总结的价值**

普通视频总结不一定需要 VideoRAG。基础总结只靠 transcript 就够了，速度更快、成本更低。

VideoRAG 适合做“增强版总结”：

- 给章节匹配关键画面
- 找出视频中的视觉证据
- 支持视觉相关问答
- 根据摘要推荐高光片段
- 为后续剪辑生成候选素材

**当前问题**

- 预处理很重：Whisper、多模态 caption、ImageBind 都耗时。
- 长视频成本高：37 分钟视频会切出很多片段，多模态 caption 调用次数多。
- 不适合前台同步执行，应该作为后台索引任务。
- 路径耦合明显，很多地方依赖 `dataset/video_edit/...`。
- 中断后不够可恢复，索引完成前的缓存不能很好复用。
- 结果结构偏旧流水线，只输出片段 ID，不够适合前端直接展示。

**推荐产品化方式**

不要把它包装成“自动剪辑已经完成”。更合适的定位是：

```text
视频素材索引 / 片段语义检索 / 高光推荐引擎
```

建议拆成独立服务：

```text
index_video_library(video_dir, session_id)
search_video_segments(session_id, query)
```

前端展示时应返回：

```text
视频路径
片段 start/end 时间
片段 caption
片段 transcript
相似度分数
可预览片段
```

这样它就能稳定服务于视频总结、视频编辑和视频创作，而不是被旧的论文 Demo 流水线绑死。
