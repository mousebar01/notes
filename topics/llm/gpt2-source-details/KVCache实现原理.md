# 大模型 KV Cache 缓存技术实现原理

此笔记详细探讨了 KV Cache 的核心概念、数学原理以及在特定魔改版 Transformer/CausalAttention 中的源码级实现方案。

## 1. 核心定义

> **在自回归文本生成（Decode 阶段）中，将前序 Token 计算出的 Key 与 Value 矩阵缓存下来。后续生成新 Token 时，仅针对当前单步输入计算对应的 Q、K、V 矩阵，避免重复计算整个上下文的历史特征。**


结合这份代码看，它的实现入口在 `CausalSelfAttention.forward()` 里：

```python
if kv_cache is None:
    y = flash_attn.flash_attn_func(q, k, v, causal=True, window_size=window_size)
else:
    k_cache, v_cache = kv_cache.get_layer_cache(self.layer_idx)
    y = flash_attn.flash_attn_with_kvcache(
        q, k_cache, v_cache,
        k=k, v=v,
        cache_seqlens=kv_cache.cache_seqlens,
        causal=True,
        window_size=window_size,
    )
```

## 1. 不用 KV Cache 时：每次都重新算整段

普通生成流程大概是：

```text
输入: [我, 爱, 北]
模型算 logits
采样出: 京

下一步输入: [我, 爱, 北, 京]
模型重新算整段 logits
采样出: 大
```

也就是说，每生成一个 token，都重新对所有历史 token 做一遍 attention。

复杂度很浪费：

```text
第 1 步算 1 个 token
第 2 步算 2 个 token
第 3 步算 3 个 token
...
```

历史 token 的 K/V 其实早就算过了，但每次都重复算。

---

## 2. 用 KV Cache 后：历史 K/V 直接复用

Attention 里面，每个 token 都会生成：

```text
Q = query
K = key
V = value
```

当前 token 需要用自己的 Q 去看历史所有 K/V：

```text
当前 Q  ×  历史 K  -> attention score
attention score × 历史 V -> 当前输出
```

所以生成新 token 时，真正需要新算的是：

```text
新 token 的 Q
新 token 的 K
新 token 的 V
```

而旧 token 的 K/V 可以缓存起来。

流程变成：

```text
第 1 步：
算 token1 的 K/V，存入 cache

第 2 步：
只算 token2 的 K/V
然后 token2 的 Q 去看 cache 里的 token1 K/V + token2 K/V

第 3 步：
只算 token3 的 K/V
然后 token3 的 Q 去看 cache 里的 token1/token2/token3 的 K/V
```

---

## 3. 这份代码里 cache 是按 layer 存的

注意这一行：

```python
k_cache, v_cache = kv_cache.get_layer_cache(self.layer_idx)
```

说明 KV Cache 不是一个全局 K/V，而是：

```text
第 0 层有自己的 K cache / V cache
第 1 层有自己的 K cache / V cache
第 2 层有自己的 K cache / V cache
...
```

因为每一层 attention 的输入 `x` 都不一样，所以每一层算出来的 K/V 也不一样。

结构大概是：

```text
kv_cache
├── layer 0
│   ├── k_cache
│   └── v_cache
├── layer 1
│   ├── k_cache
│   └── v_cache
├── layer 2
│   ├── k_cache
│   └── v_cache
...
```

---

## 4. 每一层 forward 时发生了什么？

在 attention 里，先正常算当前输入的 q/k/v：

```python
q = self.c_q(x).view(B, T, self.n_head, self.head_dim)
k = self.c_k(x).view(B, T, self.n_kv_head, self.head_dim)
v = self.c_v(x).view(B, T, self.n_kv_head, self.head_dim)
```

这里的 `T` 有两种情况：

训练 / prefill 阶段：

```text
T = 整段上下文长度
```

逐 token decode 阶段：

```text
T = 1
```

然后如果 `kv_cache is not None`，就进入缓存分支：

```python
k_cache, v_cache = kv_cache.get_layer_cache(self.layer_idx)
```

取出当前层已经保存的历史 K/V。

接着调用：

```python
flash_attn.flash_attn_with_kvcache(
    q, k_cache, v_cache,
    k=k, v=v,
    cache_seqlens=kv_cache.cache_seqlens,
    causal=True,
    window_size=window_size,
)
```

这一步同时做几件事：

```text
1. 把当前新算出来的 k/v 写入 k_cache/v_cache
2. 用当前 q 去 attend 缓存里的历史 k/v
3. 返回当前 token 的 attention 输出 y
```

---

## 5. `cache_seqlens` 是什么？

这里：

```python
cache_seqlens=kv_cache.cache_seqlens
```

它表示每个 batch 当前已经缓存了多少 token。

比如 batch size = 2：

```text
第一个样本已经缓存 128 个 token
第二个样本已经缓存 64 个 token
```

那可能就是：

```text
cache_seqlens = [128, 64]
```

这样 FlashAttention 才知道：

```text
这个 batch 的有效 cache 长度是多少
新 k/v 应该写到哪个位置
attention 应该看哪些历史 token
```

---

## 6. 为什么最后一层才 `advance(T)`？

代码里有：

```python
if self.layer_idx == kv_cache.n_layers - 1:
    kv_cache.advance(T)
```

也就是只有最后一层处理完，才推进 cache 的当前位置。

原因是：所有层都要把当前 token 的 K/V 写到同一个时间位置。

比如当前生成第 100 个 token：

```text
layer 0 把 K/V 写到位置 100
layer 1 把 K/V 写到位置 100
layer 2 把 K/V 写到位置 100
...
```

如果第 0 层写完就 `advance`，那第 1 层就会写到 101，位置就错了。

所以正确流程是：

```text
所有层都处理当前位置 T
最后一层结束后，统一把 cache position 往前推进
```

---

## 7. RoPE 也要配合 KV Cache 偏移

这份代码在 `GPT.forward()` 里有：

```python
T0 = 0 if kv_cache is None else kv_cache.get_pos()
cos_sin = self.cos[:, T0:T0+T], self.sin[:, T0:T0+T]
```

这点非常关键。

不用 KV Cache 时，输入整段序列：

```text
position = 0, 1, 2, 3, ...
```

用 KV Cache 逐 token 生成时，每次 `T=1`，但这个 token 的位置不是 0。

比如已经生成到第 100 个 token，当前新 token 的 RoPE 位置应该是：

```text
position = 100
```

而不是：

```text
position = 0
```

所以代码用：

```python
kv_cache.get_pos()
```

拿到当前 cache 位置，然后截取对应的 RoPE：

```python
self.cos[:, T0:T0+T]
self.sin[:, T0:T0+T]
```

这就是 KV Cache 和 RoPE 配合的关键。

---

## 8. 这份代码还缓存了前一个 embedding

除了 K/V，这里还有一个和 `smear` 相关的小缓存：

```python
x_pre_smear = kv_cache.prev_embedding
kv_cache.prev_embedding = x[:, -1:, :]
```

因为 smear 会把前一个 token 的 embedding 混入当前 token：

```python
x = x + gate * x_pre_smear
```

训练时整段序列都在，所以可以直接：

```python
x[:, 1:] + gate * x[:, :-1]
```

但逐 token 生成时，当前输入只有一个 token，拿不到前一个 token 的 embedding。

所以它额外在 `kv_cache.prev_embedding` 里保存上一步的 embedding。

这个不是标准 KV Cache 的一部分，是这份代码为了支持 `smear` 机制额外加的缓存。

---

## 9. 简化版 KV Cache 伪代码

可以这样理解：

```python
class KVCache:
    def __init__(self, n_layers, batch_size, max_seq_len, n_kv_head, head_dim):
        self.k_cache = [
            torch.empty(batch_size, max_seq_len, n_kv_head, head_dim)
            for _ in range(n_layers)
        ]
        self.v_cache = [
            torch.empty(batch_size, max_seq_len, n_kv_head, head_dim)
            for _ in range(n_layers)
        ]
        self.pos = 0

    def get_layer_cache(self, layer_idx):
        return self.k_cache[layer_idx], self.v_cache[layer_idx]

    def get_pos(self):
        return self.pos

    def advance(self, T):
        self.pos += T
```

单步生成时：

```python
# 当前 token
q, k, v = attention_projection(x)

# 写入当前层 cache 的 pos 位置
k_cache[:, pos:pos+1] = k
v_cache[:, pos:pos+1] = v

# 当前 q attend 到历史所有 k/v
y = attention(q, k_cache[:, :pos+1], v_cache[:, :pos+1])
```

---

## 10. 一句话画图

不用 KV Cache：

```text
每一步：
[所有历史 token] -> 重新算 Q K V -> attention -> 生成下一个
```

用 KV Cache：

```text
第一步：
token1 -> K/V 存起来

第二步：
token2 -> 只算 token2 的 Q/K/V
token2 的 Q 去看 [token1 K/V + token2 K/V]

第三步：
token3 -> 只算 token3 的 Q/K/V
token3 的 Q 去看 [token1 K/V + token2 K/V + token3 K/V]
```

所以 KV Cache 的本质是：

> **用显存换速度，把历史 token 的 K/V 存下来，避免自回归生成时重复计算历史上下文。**
