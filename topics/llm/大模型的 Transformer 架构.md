# 大模型的 Transformer 架构

这篇记录 decoder-only Transformer 的基本结构，以及 masked self-attention 和 softmax 的直觉。

## 整体流程

```text
Token 输入 id
  ↓
Embedding
  ↓
Transformer Decoder Block × N
  ↓
Final LayerNorm
  ↓
LM Head
  ↓
预测下一个 token
```

大模型通常是 decoder-only Transformer 架构。

输入主要通过分词和向量化实现。这样做的目的是支持自回归生成：后一个 token 的输出取决于前面的 token。

在大模型结构里说的 Embedding 层，通常指的是最前面的：

```text
token id -> token vector
```

## Decoder Block 的结构

一个简化的 decoder block 可以理解为：

```text
x
│
├───────────────┐
│               │
↓               │
RMSNorm / LayerNorm
↓
Masked Self-Attention
↓
Residual Add
│
├───────────────┐
│               │
↓               │
RMSNorm / LayerNorm
↓
MLP / FFN
↓
Residual Add
│
↓
output
```

核心组件包括：

- Norm：稳定训练和数值分布。
- Masked Self-Attention：让当前位置只能看见自己和之前的 token。
- MLP / FFN：对每个 token 的表示做非线性变换。
- Residual Add：保留原始信息，缓解深层网络训练问题。

## Attention 公式

普通 attention 是：

```text
score = QK^T / sqrt(d)
prob = softmax(score)
out = prob V
```

掩码注意力是在 softmax 前加 mask：

```text
score = QK^T / sqrt(d)
score = score + mask
prob = softmax(score)
out = prob V
```

mask 的作用是让未来 token 的注意力权重变成 0。

## Softmax

Softmax 会把一组任意实数变成一个概率分布。

如果输入是：

```text
z = [z_1, z_2, ..., z_n]
```

那么输出是：

```text
p_i = exp(z_i) / sum_j exp(z_j)
```

并且：

```text
sum_i p_i = 1
```

举个例子：

```text
z = [2, 1, 0]
softmax(z) ≈ [0.665, 0.245, 0.090]
```

## 注意力里的 softmax

在注意力机制里，如果第 `i` 个 token 对所有 token 的打分是：

```text
S_i = [S_i1, S_i2, ..., S_in]
```

那么 softmax 后：

```text
A_ij = exp(S_ij) / sum_t exp(S_it)
```

这里的 `A_ij` 表示：

> 第 `i` 个 token 分配给第 `j` 个 token 的注意力权重。

## Masked Attention

如果是带 mask 的 attention：

```text
A_ij = exp(S_ij + M_ij) / sum_t exp(S_it + M_it)
```

其中：

```text
M_ij = 0       表示允许关注
M_ij = -inf    表示不允许关注
```

如果某个位置被 mask：

```text
M_ij = -inf
```

那么：

```text
exp(S_ij + M_ij) = exp(-inf) = 0
```

所以这个位置的注意力权重就是 0。

