# 大模型指令微调（SFT）原理与实践

此笔记用于梳理大模型指令微调（Supervised Fine-Tuning, SFT）的基本原理、数据渲染格式、Loss Masking 机制以及工具调用（Tool Use）的实现逻辑。

## 1. 为什么 Base Model 需要 SFT 微调？

**基础模型（Base Model）通常无法直接用于对话聊天**。它们一般是在大体量无监督语料上预训练出来的，其核心能力是预测下一个 Token（续写文本）。而对话模型（Chat Model）则需要学习如何在特定对话格式下理解并回复用户。

- **Base Model 的训练目标**：续写互联网文本。
- **Chat Model 的训练目标**：按照对话格式（User/Assistant）合理回答用户问题。


base model 看到：

```text
What is the capital of France?
```

它不一定会回答：

```text
Paris.
```

它可能续写成：

```text
What is the capital of France? This question is often asked in geography quizzes...
```

因为它学到的是“文本接下来长什么样”，不是“我是助手，我应该回答问题”。

chat model 需要额外训练它看到这种结构：

```text
<|user_start|>
What is the capital of France?
<|user_end|>
<|assistant_start|>
Paris.
<|assistant_end|>
```

训练目标仍然是 next-token prediction，但数据分布变成了“用户-助手对话”。这样模型才学会：

```text
看到 user 问题
-> 轮到 assistant
-> 生成回答
-> 在 <|assistant_end|> 处结束
```

所以通常路线是：

```text
1. 预训练 base model
   学语言、知识、模式、推理雏形

2. SFT supervised fine-tuning
   学会指令跟随、聊天格式、回答风格

3. 偏好优化 RLHF / DPO / RL
   学会更符合人类偏好的回答
```

ChatGPT、Claude、Gemini 这类都不是“只预训练完就直接拿来聊天”的。它们都会经历指令微调、偏好对齐、安全训练等阶段。

你现在训练的 `d12_4090` 是 base model，所以它会续写文本；如果要让它进入 chat 模式，就要做 SFT。

好，SFT 这一步的核心非常清楚：**还是 next-token prediction，但只训练 assistant 的回答部分。**

我们用一个小对话看：

```python
[
  {"role": "user", "content": "What is PEFT?"},
  {"role": "assistant", "content": "PEFT is parameter-efficient fine-tuning."}
]
```

nanochat 会渲染成：

```text
<|bos|>
<|user_start|>What is PEFT?<|user_end|>
<|assistant_start|>PEFT is parameter-efficient fine-tuning.<|assistant_end|>
```

对应 token ids 里，特殊 token 是：

```text
4087 -> <|bos|>
4088 -> <|user_start|>
4089 -> <|user_end|>
4090 -> <|assistant_start|>
4091 -> <|assistant_end|>
```

关键是它还生成一个 `mask`：

```text
mask=0：不计算 loss
mask=1：计算 loss
```

我们看到：

```text
<|bos|>                         mask=0
<|user_start|>                  mask=0
What is PEFT?                   mask=0
<|user_end|>                    mask=0
<|assistant_start|>             mask=0
PEFT is parameter-efficient...  mask=1
<|assistant_end|>               mask=1
```

也就是说，SFT 训练时：

```text
用户问题部分不训练模型去“预测”
助手回答部分才训练模型去预测
```

代码在 [tokenizer.py](/home/sy/learning/test-peft/nanochat/nanochat/tokenizer.py:312)：

```python
if message["role"] == "user":
    add_tokens(user_start, 0)
    add_tokens(value_ids, 0)
    add_tokens(user_end, 0)
```

用户部分全是 `mask=0`。

助手部分在 [tokenizer.py](/home/sy/learning/test-peft/nanochat/nanochat/tokenizer.py:318)：

```python
add_tokens(assistant_start, 0)
add_tokens(value_ids, 1)
add_tokens(assistant_end, 1)
```

助手内容和结束符是 `mask=1`。

然后在 [chat_sft.py](/home/sy/learning/test-peft/nanochat/scripts/chat_sft.py:289) 里仍然构造：

```python
inputs = batch_tensor[:, :-1]
targets = batch_tensor[:, 1:]
```

但它会用 mask 把不该训练的位置改成 `-1`：

```python
targets[mask_targets == 0] = -1
```

这个 `-1` 很重要。模型算 cross entropy 时会忽略 `-1` 位置，也就是：

```text
不让 user prompt、BOS、padding 等部分产生 loss
```

所以 SFT 和预训练的区别是：

```text
预训练：
整段普通文本几乎每个 token 都算 loss

SFT：
对话被特殊 token 包起来，但只在 assistant 回答部分算 loss
```

训练循环本身仍然类似，在 [chat_sft.py](/home/sy/learning/test-peft/nanochat/scripts/chat_sft.py:433)：

```python
loss = model(x, y)
loss.backward()
optimizer.step()
model.zero_grad()
```

一句话总结 SFT：

```text
SFT 把 user/assistant 对话渲染成特殊 token 序列，只监督 assistant 的回答 token，让 base model 学会在看到用户消息后按助手格式回答。
```

继续看下来，SFT 其实把所有“任务”都统一成一种对象：

```text
conversation = {
  "messages": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ]
}
```

不同数据集只是生成 conversation 的方式不同。

**1. 普通聊天数据**

比如 SmolTalk 在 [smoltalk.py](/home/sy/learning/test-peft/nanochat/tasks/smoltalk.py:22)：

```python
row = self.ds[index]
messages = row["messages"]
conversation = {"messages": messages}
```

它本来就是 user/assistant 对话。

**2. MMLU 多选题**

MMLU 原始数据是：

```text
question
choices
answer
```

nanochat 把它包装成对话，在 [mmlu.py](/home/sy/learning/test-peft/nanochat/tasks/mmlu.py:37)：

```python
user_message = render_mc(question, self.letters, choices)
assistant_message = self.letters[answer]
messages = [
    {"role": "user", "content": user_message},
    {"role": "assistant", "content": assistant_message}
]
```

也就是让模型学：

```text
用户：多选题 + 选项
助手：B
```

我们刚才模拟了一个：

```text
<|user_start|>Multiple Choice question: Which planet is known as the Red Planet?
- Earth=A
- Mars=B
- Jupiter=C
- Venus=D

Respond only with the letter of the correct answer.<|user_end|>
<|assistant_start|>B<|assistant_end|>
```

它只有 assistant 的 `B` 和 `<|assistant_end|>` 被监督：

```text
supervised tokens: 2
```

**3. GSM8K 数学题 + 工具调用**

GSM8K 更有意思，在 [gsm8k.py](/home/sy/learning/test-peft/nanochat/tasks/gsm8k.py:59)。

它会把答案里的计算片段解析成：

```python
{"type": "python", "text": "3*4"}
{"type": "python_output", "text": "12"}
```

渲染后像这样：

```text
<|assistant_start|>
We need to multiply ...
<|python_start|>3*4<|python_end|>
<|output_start|>12<|output_end|>
. Therefore, you have 12 apples.
<|assistant_end|>
```

这里有个细节：

```text
python 调用本身被监督
python_output 不被监督
```

为什么？因为推理时 output 是工具返回的，不应该让模型“瞎编工具输出”。代码在 [tokenizer.py](/home/sy/learning/test-peft/nanochat/nanochat/tokenizer.py:335)：

```python
# python output ... none of these tokens are supervised
add_tokens(output_start, 0)
add_tokens(value_ids, 0)
add_tokens(output_end, 0)
```

这就是 tool-use 的雏形。

**4. SFT dataloader 和预训练 dataloader 的区别**

预训练 dataloader 会裁剪文档来填满 batch。

SFT dataloader 在 [chat_sft.py](/home/sy/learning/test-peft/nanochat/scripts/chat_sft.py:187) 做的是：

```text
conversation 整体塞入 row
能放下就完整放
放不下就 padding
不裁剪 conversation
```

原因是对话被裁断会很怪，比如只剩半个 assistant 回答。

然后它构造：

```python
inputs = batch_tensor[:, :-1]
targets = batch_tensor[:, 1:]
```

再用 mask 忽略不该学的位置：

```python
targets[mask_targets == 0] = -1
```

所以 SFT 的训练目标是：

```text
看到 user prompt 和 assistant_start 后，
只学习 assistant response 应该是什么。
```

**5. SFT 后怎么聊天**

chat_cli 在 [chat_cli.py](/home/sy/learning/test-peft/nanochat/scripts/chat_cli.py:71) 手动构造对话 token：

```python
conversation_tokens.append(user_start)
conversation_tokens.extend(tokenizer.encode(user_input))
conversation_tokens.append(user_end)
conversation_tokens.append(assistant_start)
```

然后开始生成：

```python
for token_column, token_masks in engine.generate(conversation_tokens, ...):
    print(tokenizer.decode([token]))
```

也就是说 chat 推理的 prompt 长这样：

```text
<|bos|>
<|user_start|>你的问题<|user_end|>
<|assistant_start|>
```

模型接下来就应该生成 assistant 的回答，直到：

```text
<|assistant_end|>
```

一句话总结：

```text
SFT 把各种任务都转成 user/assistant 对话格式，只监督 assistant token；chat_cli 用同样格式提示模型，于是模型知道“现在轮到助手回答了”。
```