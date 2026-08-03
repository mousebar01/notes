# 大模型预训练

这里放大模型预训练链路相关笔记，重点是把数据、tokenizer、dataloader、训练目标和评估指标串起来。

## 建议阅读顺序

1. [预训练数据格式](./预训练数据格式.md)：CSV、JSON、JSONL、Parquet 的区别，以及为什么大规模训练数据常用 Parquet。
2. [Tokenizer 与 Embedding 的关系](./Tokenizer%20与%20Embedding%20的关系.md)：文本如何变成 token id，token id 又如何通过 embedding 变成向量。
3. [预训练的自监督形式](./预训练的自监督形式.md)：`x/y` 如何由 token 序列右移得到，以及最小 forward、loss、backward、optimizer 闭环。
4. [Validation BPB 指标](./Validation%20BPB%20指标.md)：nanochat 里 `bpb` 指标的含义，以及如何看训练趋势。

## 当前主线

预训练可以先按这条链路理解：

```text
原始文本
-> 数据文件 / shard
-> tokenizer 训练与编码
-> dataloader 组织 batch
-> 构造 x 和 y
-> embedding
-> Transformer forward
-> next-token prediction loss
-> backward
-> optimizer 更新参数
-> validation bpb / checkpoint / sample
```

这组笔记暂时不追求覆盖所有预训练细节，先把最小闭环讲清楚。

## nanochat 源码阅读路径

玩具实验阶段先理解数据流和训练闭环，不急着调参。可以按下面顺序阅读 [karpathy/nanochat](https://github.com/karpathy/nanochat)：

| 顺序 | 文件 | 先回答的问题 |
| --- | --- | --- |
| 1 | `nanochat/dataset.py` | 数据从哪里来、如何保存和划分？ |
| 2 | `scripts/tok_train.py` | tokenizer 用什么训练、产出什么？ |
| 3 | `nanochat/tokenizer.py` | 字符串如何变成 token id？ |
| 4 | `nanochat/dataloader.py` | 文档如何拼成 batch 和 `x/y`？ |
| 5 | `nanochat/gpt.py` | 模型输入输出 shape 和结构是什么？ |
| 6 | `scripts/base_train.py` | 训练循环、checkpoint 如何运行？ |
| 7 | `scripts/base_eval.py` | validation bpb 如何计算？ |
| 8 | `scripts/chat_sft.py` | base model 如何变成 chat model？ |
