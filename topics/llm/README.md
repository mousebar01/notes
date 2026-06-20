# LLM

这里放模型、API、payload、微调和推理相关笔记。

不放 Agent 运行机制；Agent 上下文、安全、工具边界放到 [topics/agent](../agent/README.md)。外部论文和仓库原文优先放 `reference/`，但 QLoRA 当前学习资料暂时保留在本目录，避免破坏已有阅读路径。

## 当前笔记

- [DeepSeek HTTP payload 结构](./DeepSeek%20HTTP%20payload%20结构.md)：模型 API 请求中 `messages`、`tools`、控制字段的职责边界。
- [大模型的主要部分](./大模型的主要部分.md)：架构、分词、注意力和采样这几条学习主线。
- [大模型的 Transformer 架构](./大模型的%20Transformer%20架构.md)：decoder-only Transformer、masked attention 和 softmax 的基本理解。
- [手撕注意力机制](./手撕注意力机制.md)：用 PyTorch 写 causal self-attention、多头注意力和 Transformer Block。
- [大模型预训练](./pretraining/README.md)：数据格式、tokenizer、dataloader、`x/y` 构造、embedding 和 bpb 指标。
- [QLoRA 学习资料](./QLoRA/README.md)：QLoRA / LoRA 的一手论文、官方仓库和官方文档入口。
