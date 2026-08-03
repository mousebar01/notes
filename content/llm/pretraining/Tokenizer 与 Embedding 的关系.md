# 大模型 Tokenizer 与 Embedding 的关系

大模型不能直接处理自然语言文本。它通常要先经过 tokenizer，把文本切成 token，再映射成 token id，最后由 embedding 层把 token id 变成向量。

可以先记住这条链路：

```text
文本
-> tokenizer 切分
-> token id 序列
-> token embedding
-> 加上 position embedding
-> Transformer 输入
```

## Tokenizer 做了什么

Tokenizer 处理文本时，会参照已经训练好的词表和切分规则，把文本变成 token id 序列，并且可以在前后加特殊符号。

更准确地说：

```text
tokenizer = 切分规则 + 词表 + merge 规则 + 特殊 token 表
```

它不是临时随便切，而是根据训练 tokenizer 时学到的词表和合并规则来做。

比如一个 tokenizer 的词表大小是：

```text
vocab_size = 4096
```

意思是它最多有 4096 个 token id，包括普通文本片段、BPE 合并出来的常见片段，以及 `<bos>`、`<eos>` 这类特殊 token。

编码时大致发生这些事：

```text
1. 按规则把文本粗分块
2. 每块转成 byte 或字符片段
3. 根据 BPE / Unigram / WordPiece 等规则合并常见片段
4. 每个 token 查词表，得到 token id
```

所以文本不是直接变成向量，而是先变成编号。后面模型的 embedding 层再根据这些编号查表，把编号变成向量。

## 词表大小的取舍

词表设计的核心是在 **token 数量** 和 **表达粒度** 之间做平衡。

词表太小，比如 `vocab_size=4096`，优点是 embedding 参数少、输出层小、模型更轻。缺点是很多词会被切得很碎。

例如：

```text
internationalization
-> inter / nat / ion / al / iz / ation
```

中文也可能被切成：

```text
大 / 型 / 语 / 言 / 模 / 型
```

这样同一句话会占用更多 token，上下文窗口更快被填满，attention 计算也更贵。

词表太大，比如 `vocab_size=100000`，优点是常见词和短语可以作为完整 token，文本压缩率更高。缺点是 embedding 表和输出 softmax 层都会变大，低频 token 也更难学充分。

可以简单理解为：

```text
词表小：省参数，但费上下文。
词表大：省上下文，但费参数和训练数据。
```

## 压缩率很重要

判断 tokenizer 好不好，一个重要指标是：

```text
同一段文本会被切成多少 token
```

例如同一句中文：

```text
我正在学习大语言模型微调
```

tokenizer A 可能切成：

```text
我 / 正在 / 学习 / 大 / 语言 / 模型 / 微调
```

tokenizer B 可能切成：

```text
我 / 正 / 在 / 学 / 习 / 大 / 语 / 言 / 模 / 型 / 微 / 调
```

A 对中文更高效，因为同样的文字占用更少 token。

这对 LLM 很重要，因为上下文窗口是按 token 算的。同样是 4096 token，上下文压缩率越好，能塞进去的真实文字越多。

## 多语言和代码场景

如果模型主要服务中文，就不能只用英文语料训练 tokenizer。否则中文可能被切得很碎。

多语言 tokenizer 要考虑训练语料比例：

```text
英文、中文、代码、数学、符号、少数语言、emoji、网页噪声
```

词表会偏向训练 tokenizer 时出现频率高的语言。如果英文占比太高，中文压缩率可能就差。

代码模型也要特别考虑 tokenizer。代码里有很多固定模式：

```text
def
class
import
return
snake_case
camelCase
括号
缩进
换行
```

好的代码 tokenizer 往往会保留常见代码片段，比如 `"def"`、`"return"`、`"self"`、`"__init__"`、缩进和换行。否则代码会被切得很碎，影响训练效率和生成质量。

## 特殊 token

除了普通 token，词表里还会有特殊 token。常见包括：

```text
<bos>：开始
<eos>：结束
<pad>：填充
<unk>：未知
<mask>：遮盖，BERT 类模型常用
<user> / <assistant> / <system>：对话角色
<tool_call> / <tool_result>：工具调用
```

聊天模型尤其依赖特殊 token。一轮对话可能被组织成：

```text
<system>
你是一个助手
<user>
解释一下 LoRA
<assistant>
LoRA 是一种参数高效微调方法
<eos>
```

如果特殊 token 和聊天模板设计混乱，SFT 数据格式就会乱，模型也更难学会什么时候回答、什么时候停止。

## 常见 tokenizer 算法

常见算法大致有：

```text
BPE：GPT 系列常见，从小片段开始，把高频共现片段不断合并。
WordPiece：BERT 常见，也合并子词，但目标偏向最大化语言模型似然。
Unigram：SentencePiece / T5 常见，先准备候选子词，再删除不重要的。
Byte-level BPE：GPT-2、RoBERTa 常见，从 byte 开始，基本避免 OOV。
```

现在大模型里，byte-level 或 byte fallback 很常见，因为它能避免遇到生僻字符就无法表示。

## 训练 tokenizer 是什么

训练 tokenizer 不等于训练神经网络。以 BPE 为例，它的“训练”更像是一个统计和贪心合并过程，而不是梯度下降。

模型训练通常是：

```text
参数随机初始化
-> 前向传播
-> 计算 loss
-> 反向传播
-> 梯度下降更新参数
```

BPE tokenizer 训练大致是：

```text
读取大量文本
-> 统计相邻字符 / byte 片段的出现频率
-> 找到最常出现的一对片段
-> 把它们合并成一个新 token
-> 重复这个过程
-> 直到达到设定的 vocab_size
```

所以 BPE 训练没有 loss、gradient、backpropagation、optimizer、learning rate。它主要是在语料里统计哪些片段常见，哪些片段值得合并进词表。

一个简单例子：

```text
low
lower
lowest
```

一开始可能拆成：

```text
l o w
l o w e r
l o w e s t
```

如果 `l + o` 最常出现，就合并成 `lo`；之后如果 `lo + w` 又很常见，就继续合并成 `low`。最后可能得到：

```text
lower  -> low + er
lowest -> low + est
```

BPE 训练完成后，通常会得到词表和合并规则，例如：

```text
vocab.json      # token 到 id 的映射
merges.txt      # BPE 合并规则
tokenizer.json  # 完整 tokenizer 配置
```

所以这里要区分两件事：

```text
训练 tokenizer：
用统计方法学出 token、token id 和 merge 规则。

训练模型：
用梯度下降学习 embedding、attention、MLP 等模型参数。
```

也就是说，tokenizer 先确定“有哪些 token、每个 token 的 id 是多少”；模型训练再确定“每个 token id 对应什么向量”。

## 微调时通常不要改 tokenizer

如果只是微调 Qwen、LLaMA、GPT 类模型，通常不要自己改 tokenizer。

原因是 tokenizer 和模型 embedding 层是绑定的。乱改 tokenizer 会导致：

```text
token id 对不上
embedding 语义错乱
模型原有能力下降
需要重新训练 embedding
```

实际项目里通常只做两件事：

```text
1. 使用原模型自带 tokenizer
2. 必要时添加少量 special tokens，然后 resize_token_embeddings
```

例如：

```python
tokenizer.add_special_tokens({
    "additional_special_tokens": ["<tool_call>", "<tool_result>"]
})
model.resize_token_embeddings(len(tokenizer))
```

但新增 token 的 embedding 通常是随机初始化的，还需要通过微调学出来。

只有在从零预训练模型、做特定语言或领域模型、原 tokenizer 压缩率很差，或者要设计自己的模型体系时，才更可能自己训练 tokenizer。

## Token embedding 本质是查表

Tokenizer 得到的是 token id，例如：

```text
[1, 10, 25, 88, 2]
```

Embedding 层会把这些 id 映射成向量。最小代码是：

```python
import torch
import torch.nn as nn

vocab_size = 128
hidden_size = 64

token_embedding = nn.Embedding(
    num_embeddings=vocab_size,
    embedding_dim=hidden_size,
)

input_ids = torch.tensor([
    [1, 10, 25, 88, 2],
    [1, 33, 44, 55, 2],
])

x = token_embedding(input_ids)

print(input_ids.shape)  # torch.Size([2, 5])
print(x.shape)          # torch.Size([2, 5, 64])
```

含义是：

```text
原来是 [2, 5]：
2 句话，每句话 5 个 token id

embedding 后是 [2, 5, 64]：
2 句话，每句话 5 个 token，每个 token 变成 64 维向量
```

它内部本质上就是查表：

```python
x = token_embedding.weight[input_ids]
```

如果 embedding 表形状是：

```text
[128, 64]
```

意思就是：

```text
128 个 token
每个 token 一个 64 维向量
```

## 为什么还要 position embedding

Token embedding 只告诉模型“这个 token 是什么”，但不知道“这个 token 在第几个位置”。

比如：

```text
我 喜欢 你
你 喜欢 我
```

这两个句子的 token 集合差不多，但顺序不同，意思不同。

所以 GPT 里通常会把 token embedding 和 position embedding 相加：

```python
x = token_emb + pos_emb
```

最小结构类似这样：

```python
class MiniGPTEmbedding(nn.Module):
    def __init__(self, vocab_size, max_seq_len, hidden_size):
        super().__init__()
        self.token_embedding = nn.Embedding(vocab_size, hidden_size)
        self.position_embedding = nn.Embedding(max_seq_len, hidden_size)

    def forward(self, input_ids):
        batch_size, seq_len = input_ids.shape

        token_emb = self.token_embedding(input_ids)
        position_ids = torch.arange(seq_len, device=input_ids.device)
        position_emb = self.position_embedding(position_ids)

        return token_emb + position_emb
```

在 Hugging Face GPT-2 里，对应关系通常是：

```text
self.transformer.wte  # word token embedding
self.transformer.wpe  # word position embedding
```

如果配置是：

```python
GPT2Config(
    vocab_size=128,
    n_positions=32,
    n_embd=64,
)
```

对应的 embedding 层就是：

```text
token embedding:    [128, 64]
position embedding: [32, 64]
```

## 总结

Tokenizer 的作用，是把文本按照词表和切分规则变成 token id。Embedding 的作用，是把 token id 查表变成向量。

一句话：

> 文本先被 tokenizer 编码成 token id；token id 再通过 `nn.Embedding(vocab_size, hidden_size)` 变成向量，并加上位置信息，作为 Transformer 的输入。

训练 tokenizer 主要是在语料上统计高频片段并学习词表和合并规则；真正通过梯度下降训练的是模型参数，比如 embedding、attention 和 MLP。

词表设计不是为了“看起来像单词”，而是为了让模型用尽量少的 token 表示尽量多的真实文本，同时让高频模式容易学习、低频内容也能组合出来。
