# QLoRA 的概念

QLoRA 不只是“LoRA + 4bit 量化”这么简单。它为了让低显存训练尽量不掉性能，做了几件关键工程设计。

可以先这样理解：

```text
QLoRA =
4-bit 量化底座模型
+ LoRA adapter 训练
+ 双重量化进一步省显存
+ 分页优化器防止显存峰值爆掉
```

## 1. NF4：4-bit NormalFloat

普通理解是：

```text
FP16 / BF16 权重 -> 4-bit 权重
```

但 QLoRA 不是简单用 int4，而是用了 NF4，也就是 NormalFloat 4-bit。

原因是神经网络权重通常接近正态分布：

```text
W ~ N(0, sigma^2)
```

大部分权重集中在 0 附近，极端大值比较少。

如果用普通 int4，它的 16 个取值通常比较均匀，例如：

```text
-8, -7, -6, ..., 6, 7
```

但神经网络权重不是均匀分布的。所以 NF4 的想法是：

```text
既然权重大多集中在 0 附近，
那就在 0 附近分配更密的量化点，
在两端分配更稀的量化点。
```

这样更适合模型权重分布，量化误差更小。

论文里说 NF4 是“针对正态分布数据的信息论上最优量化数据类型”，可以理解为：NF4 是专门为接近正态分布的神经网络权重设计的 4-bit 表示方式，比普通 int4 更适合保存模型权重。

## 2. Double Quantization：双重量化

量化不是只存一个 4-bit 数就完了，还需要存一些缩放系数。

比如一组 FP16 权重量化成 4-bit 时，通常要保存：

```text
4-bit 量化后的权重
+ scale / zero point 这类量化常数
```

这些量化常数本身也要占显存。

Double Quantization 的思路是：

```text
既然量化常数也占空间，
那我把量化常数也再量化一次。
```

也就是：

```text
原始权重 -> 4-bit 量化
量化常数 -> 再量化
```

它解决的是一个细节问题：4-bit 权重已经很小了，但量化时附带的 scale 等常数仍然会带来额外开销。

论文里说平均每个参数节省约 `0.37 bit`。这个数字看起来很小，但模型很大时非常可观。

例如 65B 模型：

```text
650 亿参数 * 0.37 bit
≈ 240.5 亿 bit
≈ 3GB
```

所以这不是理论小优化，而是真的能省好几 GB 显存。

## 3. Paged Optimizer：分页优化器

Paged Optimizer 主要解决训练时的显存峰值问题。

训练大模型时，显存不是一直稳定的。某些时刻会突然变高，比如：

```text
长序列
小 batch
gradient checkpointing
反向传播中重新计算激活
优化器状态更新
```

这些可能导致一瞬间显存爆掉。

Paged Optimizer 的思路是：

```text
显存不够时，把一部分优化器状态临时放到 CPU 内存里，
需要时再调回来。
```

它用了 NVIDIA Unified Memory，可以把 GPU 显存和 CPU 内存做类似“分页”的管理。

所以它的作用不是主要降低平均显存，而是防止训练过程中某个瞬间显存峰值 OOM。

## 4. 更广的 LoRA adapter 覆盖

早期 LoRA 论文里，很多实验主要只在注意力层的部分矩阵上加 LoRA，比如：

```text
Wq
Wv
```

但是 QLoRA 为了尽量减少性能损失，通常会在更多层、更多模块上加 LoRA adapter。

现代实践里常见：

```text
q_proj
k_proj
v_proj
o_proj
gate_proj
up_proj
down_proj
```

也就是 Attention 模块加 LoRA，MLP 模块也加 LoRA。

原因是 QLoRA 把底座模型量化到了 4-bit，量化本身可能带来一点精度损失。为了弥补这个损失，它让 LoRA adapter 的覆盖范围更广。

## 5. LoRA 和 QLoRA 的区别

```text
LoRA:
base model 通常 FP16 / BF16 加载
冻结 base model
训练低秩 adapter

QLoRA:
base model 用 NF4 4-bit 加载
冻结 base model
训练低秩 adapter
进一步用 double quantization 省空间
用 paged optimizer 防止显存峰值
通常在更多层加 adapter 来保持效果
```

一句话总结：

> LoRA 主要解决“训练参数太多”的问题；QLoRA 在 LoRA 基础上进一步解决“底座模型加载显存太大”和“训练显存峰值容易爆”的问题。

