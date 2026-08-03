# Validation BPB 指标

`bpb` 是 **bits per byte**，用于衡量语言模型平均需要多少 bit 的信息量来预测或压缩原始文本的一个 byte。

```text
Validation BPB 越低越好
```

## 为什么不用 token-level loss 直接比较

不同 tokenizer 的词表和切分方式不同，同一文本会产生不同 token 数。按 byte 归一化后，更适合比较不同 tokenizer、模型和实验设置。

直觉上：

- BPB 高：模型对验证文本的预测更吃力。
- BPB 低：模型更符合验证数据分布。

## 如何看训练输出

短 smoke run 可能出现：

```text
Step 00000 | Validation BPB: 3.547557
Step 00010 | Validation BPB: 3.579815
Step 00020 | Validation BPB: 3.460436
```

单次评估会上下波动，不要求每个点都下降。应该观察更长区间的总体趋势，并同时确认训练集 loss、验证集 BPB、样本质量和是否过拟合。

BPB 适合做实验间比较，但仍要保证数据集、byte 统计方式和评估代码一致。
