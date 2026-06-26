# GPT-2 源码魔改细节

此目录包含针对魔改版 GPT-2 / Transformer 源码的详细设计与实现拆解，主要关注在经典注意力机制外，现代小模型在结构与工程上的优化实践。

## 笔记索引

- [GPT2源码魔改细节](./GPT2源码魔改细节.md)：RoPE、QK Norm、ReLU²、无 Bias 设计、Grouped Query Attention (GQA)、滑动窗口注意力、Value Embedding、x0 残差、自适应残差缩放、Smear 机制以及 Muon 优化器等魔改特性的系统解析。
- [KVCache实现原理](./KVCache实现原理.md)：基于魔改版代码的 KV Cache 机制剖析，涵盖 Prefill 与 Decode 阶段逻辑、多层缓存管理、`cache_seqlens` 作用、RoPE 位置偏移以及 Smear 缓存细节。
