# LLM

这里放模型、API、payload、微调和推理相关笔记。

## 学习地图

```text
文本 -> tokenizer -> token id -> embedding
     -> Transformer / attention
     -> logits -> decoding / sampling
```

应用层先理解 tokenizer、上下文和采样；需要深入模型结构时再看 attention 与 Transformer；需要训练模型时进入 Pretraining、QLoRA 和 SFT 专题。
