# GPT-2 / Transformer 源码魔改与优化技术拆解

此笔记对魔改版 GPT-2 / Transformer 的源码结构、模型结构优化设计以及训练与推理工程优化进行了深入拆解。可以按“模型结构优化”和“训练/推理工程优化”两类看。

## 1. 位置编码：RoPE，而不是传统 position embedding

这里没有可学习的位置编码，而是用了 **Rotary Embedding**：

```python
q, k = apply_rotary_emb(q, cos, sin), apply_rotary_emb(k, cos, sin)
```

它的作用是给 `q/k` 注入位置信息。相比传统 GPT 的 `pos_embedding + token_embedding`，RoPE 更适合长上下文，也更常见于现代 LLM。

你可以理解成：

```text
不是给 token embedding 加一个位置向量
而是在 q/k 空间里做旋转，让 attention 感知相对位置
```

---

## 2. QK Norm：让注意力更稳定

这里有：

```python
q, k = norm(q), norm(k)
q = q * 1.2
k = k * 1.2
```

也就是对 query 和 key 做 RMSNorm。

这个点挺重要，因为 attention score 本质上来自：

```text
q @ k
```

如果 q/k 的尺度不稳定，attention 分布就可能过尖或者过平。QK Norm 的作用就是稳定注意力分数。

后面的 `* 1.2` 是人为让注意力稍微 sharper 一点。

---

## 3. MLP 激活函数：ReLU²

MLP 不是 GELU/SwiGLU，而是：

```python
x = F.relu(x).square()
```

这叫 **ReLU squared / ReLU²**。

普通 ReLU 是：

```text
max(0, x)
```

ReLU² 是：

```text
max(0, x)^2
```

它会放大强激活，压掉弱激活。可以简单理解成更“稀疏、更尖锐”的非线性。

这也是现在一些小模型训练里会尝试的设计。

---

## 4. RMSNorm，而且没有可学习参数

这里的 norm 是：

```python
def norm(x):
    return F.rms_norm(x, (x.size(-1),))
```

注意它不是：

```python
nn.RMSNorm(...)
```

而是直接函数式调用，所以没有 learnable weight。

也就是说这个 RMSNorm 只是做归一化，不额外学习缩放参数。

这比标准 LayerNorm/RMSNorm 更简洁，参数更少。

---

## 5. Linear 全部无 bias

这里的线性层基本都是：

```python
bias=False
```

比如：

```python
self.c_q = Linear(..., bias=False)
self.c_k = Linear(..., bias=False)
self.c_v = Linear(..., bias=False)
self.c_proj = Linear(..., bias=False)
```

现代 LLM 里经常去掉 bias，因为大规模训练下 bias 贡献有限，但会增加参数和实现复杂度。

你可以记成：

```text
现代 Transformer 趋势：少 bias，多 norm，结构更干净
```

---

## 6. GQA：Grouped Query Attention

这个也很关键：

```python
n_head: int = 6
n_kv_head: int = 6
```

并且代码支持：

```python
assert self.n_kv_head <= self.n_head
assert self.n_head % self.n_kv_head == 0
```

普通多头注意力是：

```text
Q 头数 = K 头数 = V 头数
```

GQA 是：

```text
Q 头比较多
K/V 头比较少
多个 Q head 共享一组 K/V
```

好处主要在推理阶段：**KV cache 更小，推理更省显存**。

虽然当前默认 `n_head = n_kv_head = 6`，等于没真正压缩，但结构上已经支持 GQA。

---

## 7. Sliding Window Attention：部分层只看短窗口

配置里有：

```python
window_pattern: str = "SSSL"
```

含义是：

```text
S = short window，只看局部上下文
L = long window，看完整上下文
```

代码里：

```python
short_window = -(-long_window // 4 // 128) * 128
```

如果 `sequence_len=2048`，短窗口大约是 768。

这意味着不是每一层都看完整上下文，而是：

```text
短窗口层：便宜，关注局部
长窗口层：贵，但能整合全局
```

这是一种效率优化。

---

## 8. Value Embedding / ResFormer 风格

这里有一个比较少见但很有意思的设计：

```python
self.value_embeds = nn.ModuleDict(...)
```

然后在 attention 里：

```python
v = v + gate.unsqueeze(-1) * ve
```

它给 value 分支额外注入 token embedding 形式的信息。

可以理解成：

```text
除了从 x 线性投影出 V
还额外从 token id 查一个 value embedding
再用 gate 混进去
```

这有点像给 value 通道加一条额外残差，让 token 原始信息更容易进入 attention 的 value 路径。

---

## 9. x0 residual：每层混入初始 embedding

forward 里：

```python
x0 = x
...
x = self.resid_lambdas[i] * x + self.x0_lambdas[i] * x0
```

这个很值得看。

普通 Transformer 每层只接收上一层的输出：

```text
x -> block1 -> block2 -> block3 ...
```

这里每层还额外混入最初的 embedding：

```text
当前层输入 = 当前 residual + 一部分原始 x0
```

作用类似防止深层网络逐渐丢失底层 token 信息。

---

## 10. resid_lambdas：每层残差缩放

代码里有：

```python
self.resid_lambdas = nn.Parameter(torch.ones(config.n_layer))
```

并且初始化成：

```python
1.15 -> 1.05
```

这表示每一层进入 block 前，对 residual stream 做一个可学习缩放。

简单说：

```text
不是盲目 x = x + block(x)
而是让模型学每层 residual 应该保留多少
```

---

## 11. Smear：把前一个 token 的 embedding 混到当前 token

这里也很有意思：

```python
x[:, 1:] + gate * x[:, :-1]
```

注释写得很直白：

```python
# cheap bigram-like info
```

意思是给当前 token 混入上一个 token 的信息。

比如序列：

```text
我 爱 北京
```

当前“爱”的表示会混一点“我”的 embedding，当前“北京”会混一点“爱”的 embedding。

这是一种很便宜的局部 bigram 信息增强。

---

## 12. Backout：减掉中间层 residual

这里：

```python
if i == backout_layer:
    x_backout = x
...
x = x - self.backout_lambda.to(x.dtype) * x_backout
```

这也比较特别。

它在中间层保存一个 residual，然后最终输出前减掉一部分。

注释说：

```text
remove low-level features
```

可以理解成：中间层可能保留了比较浅层、局部、低级的特征，最后预测前把它减掉一部分，让输出更偏向高层语义。

这个不是标准 GPT 结构，是一种实验性改造。

---

## 13. untied embedding 和 lm_head

代码里：

```python
"wte": nn.Embedding(...)
self.lm_head = Linear(...)
```

它没有把 `wte.weight` 和 `lm_head.weight` 绑定在一起。

传统 GPT 有时会做 weight tying：

```text
输入 embedding 和输出 lm_head 共用权重
```

这里是 untied：

```text
输入词嵌入和输出分类头分开学
```

好处是表达更自由，坏处是参数更多。

---

## 14. Logit softcap：限制 logits 过大

这里：

```python
softcap = 15
logits = softcap * torch.tanh(logits / softcap)
```

它把 logits 平滑限制在：

```text
[-15, 15]
```

目的通常是防止 logits 过大导致训练不稳定，或者 loss 出现极端值。

---

## 15. 初始化方式很讲究

比如：

```python
attn.c_proj.weight = 0
mlp.c_proj.weight = 0
```

这意味着一开始每个 block 的输出投影为 0。

所以模型初始时更接近：

```text
embedding -> norm -> lm_head
```

然后慢慢学会让 attention/MLP 起作用。

这类初始化可以让训练初期更稳定。

---

## 16. 优化器不是普通 AdamW，还有 Muon

这里：

```python
Factory = DistMuonAdamW if ddp else MuonAdamW
```

并且参数分组很细：

```text
lm_head
embedding
value_embeds
resid_lambdas
x0_lambdas
smear_params
matrix_params
```

矩阵参数走 Muon，embedding/scalar/lm_head 走 AdamW。

这说明这份代码不只是模型结构改造，还包含了比较激进的训练优化设计。

---

## 最值得重点看的不是注意力，而是这 6 个

如果你是为了学习和面试，不需要每个 trick 都死磕。优先看这几个：

```text
1. RoPE：现代位置编码
2. RMSNorm / QK Norm：稳定训练
3. GQA：降低 KV cache 推理成本
4. Sliding Window Attention：长上下文效率优化
5. MLP 的 ReLU²：非线性层设计
6. KV Cache：推理加速核心
```

如果是为了理解这份代码的“魔改点”，重点看：

```text
1. Value Embedding
2. x0 residual
3. resid_lambdas
4. smear
5. backout
6. logit softcap
```

一句话总结：

> 这份代码不是普通 nanoGPT，它是在 GPT 骨架上加了很多现代小模型训练 trick：RoPE、QK Norm、GQA、滑动窗口、ReLU²、特殊初始化、残差缩放、value embedding、smear/backout，以及 Muon 优化器。真正难的不是注意力本身，而是这些“小改动为什么能让训练更稳、更快、更省”。
