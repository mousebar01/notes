# QLoRA 学习资料

这里收集 QLoRA 相关的一手学习资料。优先保留论文、作者仓库、官方文档和官方示例，不放二手博客。

## 推荐学习顺序

1. 先读 LoRA 原论文，理解“只训练低秩适配矩阵”的基本思想。
2. 再读 QLoRA 原论文，重点看 4-bit quantization、NF4、double quantization、paged optimizer。
3. 看 QLoRA 官方仓库 README，理解论文方法如何落到训练脚本和依赖上。
4. 看 Hugging Face PEFT / Transformers 的官方文档，理解现代工具链里怎么配置 LoRA、QLoRA 和 bitsandbytes。
5. 最后看官方示例，例如 Gemma 的 QLoRA fine-tuning，学习一套完整训练流程。

## 已下载资料

### 论文

- [QLoRA: Efficient Finetuning of Quantized LLMs](./reference/papers/QLoRA-2305.14314.pdf)
  - 来源：arXiv `2305.14314`
  - 官方页面：https://arxiv.org/abs/2305.14314
  - 重点：4-bit NormalFloat、double quantization、paged optimizer，以及在单张 GPU 上微调大模型的设计。

- [LoRA: Low-Rank Adaptation of Large Language Models](./reference/papers/LoRA-2106.09685.pdf)
  - 来源：arXiv `2106.09685`
  - 官方页面：https://arxiv.org/abs/2106.09685
  - 重点：低秩适配、冻结原模型权重、只训练少量 adapter 参数。

### 官方仓库 README

- [artidoro/qlora README](./reference/repos/artidoro-qlora-README.md)
  - 来源：https://github.com/artidoro/qlora
  - 说明：QLoRA 论文作者仓库，适合看训练脚本、依赖、运行方式和论文复现实验入口。

- [huggingface/peft README](./reference/repos/huggingface-peft-README.md)
  - 来源：https://github.com/huggingface/peft
  - 说明：PEFT 官方仓库，适合理解 LoRA / QLoRA 在 Hugging Face 生态里的位置。

## 一手资料链接

这些是建议继续看的官方资料。有些页面这次本机网络超时，暂时只保留链接，之后网络顺的时候可以继续下载 HTML / Markdown 快照。

- QLoRA 官方仓库：https://github.com/artidoro/qlora
- LoRA 官方仓库：https://github.com/microsoft/LoRA
- PEFT 官方文档：https://huggingface.co/docs/peft
- PEFT 量化 / QLoRA 指南：https://huggingface.co/docs/peft/en/developer_guides/quantization
- PEFT LoRA 指南：https://huggingface.co/docs/peft/en/developer_guides/lora
- Transformers bitsandbytes 量化文档：https://huggingface.co/docs/transformers/en/quantization/bitsandbytes
- bitsandbytes 官方仓库：https://github.com/bitsandbytes-foundation/bitsandbytes
- bitsandbytes 官方文档：https://huggingface.co/docs/bitsandbytes
- Google Gemma QLoRA 官方示例：https://ai.google.dev/gemma/docs/core/huggingface_text_finetune_qlora

## 重点概念清单

学习时可以围绕这些问题做笔记：

- LoRA 为什么可以减少可训练参数？
- QLoRA 为什么要先量化 base model，再训练 LoRA adapter？
- NF4 和普通 int4 的区别是什么？
- double quantization 节省了什么？
- paged optimizer 解决的是显存峰值问题还是模型大小问题？
- `load_in_4bit`、`bnb_4bit_quant_type`、`bnb_4bit_compute_dtype` 分别控制什么？
- LoRA 的 `r`、`alpha`、`dropout`、`target_modules` 怎么影响训练？
- adapter 权重如何保存、加载、合并？
- QLoRA 适合 SFT、分类、偏好对齐还是继续预训练？

## 后续整理

- [ ] 下载 Hugging Face PEFT 量化指南的本地快照。
- [ ] 下载 Transformers bitsandbytes 文档的本地快照。
- [ ] 下载 LoRA 官方仓库 README。
- [ ] 下载 bitsandbytes 官方仓库 README。
- [ ] 整理一篇“QLoRA 原理笔记”。
- [ ] 整理一篇“QLoRA 训练配置速查”。

