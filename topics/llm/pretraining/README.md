# 大模型预训练

这里放大模型预训练链路相关笔记，重点是把数据、tokenizer、dataloader、训练目标和评估指标串起来。

## 建议阅读顺序

1. [预训练数据格式](./预训练数据格式.md)：CSV、JSON、JSONL、Parquet 的区别，以及为什么大规模训练数据常用 Parquet。
2. [Tokenizer 与 Embedding 的关系](./Tokenizer%20与%20Embedding%20的关系.md)：文本如何变成 token id，token id 又如何通过 embedding 变成向量。
3. [预训练的自监督形式](./预训练的自监督形式.md)：为什么预训练更准确叫自监督，以及 `x/y` 是怎么由 token 序列右移得到的。
4. [nanochat 预训练学习路径](./nanochat%20预训练学习路径.md)：阅读 nanochat 预训练源码时，可以按哪些文件和问题推进。
5. [Validation BPB 指标](./Validation%20BPB%20指标.md)：nanochat 里 `bpb` 指标的含义，以及如何看训练趋势。

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
