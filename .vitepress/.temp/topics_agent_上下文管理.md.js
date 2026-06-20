import { ssrRenderAttrs, ssrRenderStyle } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"上下文管理","description":"","frontmatter":{},"headers":[],"relativePath":"topics/agent/上下文管理.md","filePath":"topics/agent/上下文管理.md"}');
const _sfc_main = { name: "topics/agent/上下文管理.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="上下文管理" tabindex="-1">上下文管理 <a class="header-anchor" href="#上下文管理" aria-label="Permalink to &quot;上下文管理&quot;">​</a></h1><p>这篇笔记作为“Agent 单轮对话如何组织上下文”的主题入口。</p><p>它主要回答三个问题：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 一次用户输入进入 Agent 后，会经过哪些阶段？</span></span>
<span class="line"><span>2. messages、tools、runtime context、memory 分别放在哪里？</span></span>
<span class="line"><span>3. 上下文变长以后，应该怎么压缩和降级？</span></span></code></pre></div><h2 id="当前分类" tabindex="-1">当前分类 <a class="header-anchor" href="#当前分类" aria-label="Permalink to &quot;当前分类&quot;">​</a></h2><p>和上下文管理相关的内容可以先分成四类：</p><table tabindex="0"><thead><tr><th>分类</th><th>关注点</th><th>相关笔记</th></tr></thead><tbody><tr><td>单轮流程</td><td>用户输入到最终输出的主链路</td><td>本文</td></tr><tr><td>HTTP payload</td><td><code>messages</code>、<code>tools</code>、控制字段的职责边界</td><td><a href="./../llm/DeepSeek HTTP payload 结构">DeepSeek HTTP payload 结构</a></td></tr><tr><td>记忆注入</td><td>长期记忆如何检索、写入、注入 prompt</td><td>待整理</td></tr><tr><td>上下文压缩</td><td>工具结果压缩、会话记忆替换、完整 compact</td><td>本文</td></tr></tbody></table><p>一句话主线：</p><blockquote><p>上下文管理不是只拼 prompt，而是在有限窗口里决定“哪些信息保留、哪些信息检索、哪些信息压缩、哪些信息交给 API 原生字段”。</p></blockquote><h2 id="单次对话流程" tabindex="-1">单次对话流程 <a class="header-anchor" href="#单次对话流程" aria-label="Permalink to &quot;单次对话流程&quot;">​</a></h2><p>原始流程可以整理成这样：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户输入</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>输入预处理 / 风险检查</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>构建上下文</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>构建 system prompt / runtime context</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>组装原生 messages</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>ReAct loop</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>得到最终输出</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>输出后处理 / 分发</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>记录历史 / 写入记忆</span></span></code></pre></div><p>其中 <code>ReAct loop</code> 内部又可以拆成：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>调模型</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>解析 tool_calls</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>policy / hooks 检查</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>执行工具</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>工具结果回填 messages</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>再调模型</span></span></code></pre></div><h2 id="构建上下文时要放什么" tabindex="-1">构建上下文时要放什么 <a class="header-anchor" href="#构建上下文时要放什么" aria-label="Permalink to &quot;构建上下文时要放什么&quot;">​</a></h2><p>一次模型调用前，大致需要准备这些信息：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>固定 system prompt</span></span>
<span class="line"><span>动态 runtime instructions</span></span>
<span class="line"><span>当前用户输入</span></span>
<span class="line"><span>历史对话</span></span>
<span class="line"><span>检索到的 memory block</span></span>
<span class="line"><span>本轮工具结果</span></span>
<span class="line"><span>工具使用原则</span></span></code></pre></div><p>但这些信息不一定都应该塞进同一个 prompt 文本里。</p><p>更清楚的分法是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>messages:</span></span>
<span class="line"><span>  给模型阅读的上下文、历史、记忆、用户请求、工具结果。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>payload.tools:</span></span>
<span class="line"><span>  API 原生 function calling schema。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>控制字段:</span></span>
<span class="line"><span>  model / temperature / tool_choice / enable_thinking 等调用参数。</span></span></code></pre></div><p>这里最容易混淆的是工具信息：</p><blockquote><p>工具使用原则可以写在 <code>messages</code> 里，但完整工具 schema 应该放在 <code>payload.tools</code> 里。</p></blockquote><p>如果 <code>messages</code> 里已经有 <code>&lt;available_tools&gt;</code> 的大块文本，同时 <code>payload.tools</code> 里又有 function schema，就会造成重复。细节见：</p><ul><li><a href="./../llm/DeepSeek HTTP payload 结构">DeepSeek HTTP payload 结构</a></li></ul><h2 id="messages-的典型结构" tabindex="-1">messages 的典型结构 <a class="header-anchor" href="#messages-的典型结构" aria-label="Permalink to &quot;messages 的典型结构&quot;">​</a></h2><p>当前可以先按这个结构理解：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>messages</span></span>
<span class="line"><span>├─ system: 固定系统提示词</span></span>
<span class="line"><span>├─ system: 动态 runtime context</span></span>
<span class="line"><span>│  ├─ runtime instructions</span></span>
<span class="line"><span>│  ├─ retrieved_memory</span></span>
<span class="line"><span>│  └─ 工具使用原则</span></span>
<span class="line"><span>├─ history: 历史对话</span></span>
<span class="line"><span>├─ tool: 本轮工具结果</span></span>
<span class="line"><span>└─ user: 当前用户输入</span></span></code></pre></div><p>注意：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>API role 是消息级别的身份边界。</span></span>
<span class="line"><span>XML 标签是 content 内部的语义边界。</span></span></code></pre></div><p>所以 XML 标签可以出现在 system、user、assistant、tool 任意 role 的 <code>content</code> 里。它只是帮助模型理解文本分块，不是 API 的硬机制。</p><p>这一点单独记录在：</p><ul><li>本文的“XML 标签和 API role 的关系”</li></ul><h2 id="记忆和上下文压缩的关系" tabindex="-1">记忆和上下文压缩的关系 <a class="header-anchor" href="#记忆和上下文压缩的关系" aria-label="Permalink to &quot;记忆和上下文压缩的关系&quot;">​</a></h2><p>这里要分清两个概念：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>长期记忆:</span></span>
<span class="line"><span>  解决哪些信息值得长期保存、未来怎么召回。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>上下文压缩:</span></span>
<span class="line"><span>  解决当前会话太长了，怎么在有限 context window 里继续工作。</span></span></code></pre></div><p>当前笔记里已经记录了三层压缩思路：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 微压缩</span></span>
<span class="line"><span>   清除或替换旧工具结果。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 会话记忆替换</span></span>
<span class="line"><span>   用预先生成的 TurnDigest / SessionMemory 替换旧 messages。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. 完整 compact</span></span>
<span class="line"><span>   到阈值时让 LLM 总结整个历史。</span></span></code></pre></div><p>学习顺序建议：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>先看单轮 messages 怎么组装</span></span>
<span class="line"><span>再看 memory 怎么检索并注入</span></span>
<span class="line"><span>最后看旧 messages 怎么被压缩或替换</span></span></code></pre></div><p>相关内容后续可以整理成独立的 Agent 记忆系统笔记。</p><h2 id="token-预算估算" tabindex="-1">Token 预算估算 <a class="header-anchor" href="#token-预算估算" aria-label="Permalink to &quot;Token 预算估算&quot;">​</a></h2><p>要让上下文压缩在正确的时候触发，系统需要先估算当前输入大概占了多少 tokens。</p><p>这里通常有两种做法：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 估算计算 tokens</span></span>
<span class="line"><span>2. 使用 tokenizer 精确计算 tokens</span></span></code></pre></div><p>第一种是估算式计算。</p><p>例如按字符数、中文字数、英文单词数、JSON 长度、工具结果长度做近似换算：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>中文：大致按 1-2 个字符 ≈ 1 token 估算</span></span>
<span class="line"><span>英文：大致按 3-4 个字符 ≈ 1 token 估算</span></span>
<span class="line"><span>JSON / 代码 / 日志：通常 token 密度更高，需要更保守</span></span></code></pre></div><p>这种方式优点是快、实现简单、不依赖具体模型 tokenizer。缺点是不够准，尤其遇到代码、长 JSON、混合语言、工具输出时，误差可能比较大。</p><p>适合用在：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>快速预判</span></span>
<span class="line"><span>粗略预算</span></span>
<span class="line"><span>提前触发轻量压缩</span></span>
<span class="line"><span>没有 tokenizer 可用的 fallback 场景</span></span></code></pre></div><p>第二种是 tokenize 计算。</p><p>也就是使用和目标模型匹配或接近的 tokenizer，把即将发送的 <code>messages</code>、tool result、runtime context、memory block 全部编码一遍，然后得到更接近真实请求的 token 数。</p><p>这种方式优点是更准确，可以更稳地控制触发阈值。缺点是实现成本更高，而且不同模型的 tokenizer 不完全一样。</p><p>适合用在：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>正式发送请求前</span></span>
<span class="line"><span>决定是否 compact 前</span></span>
<span class="line"><span>高风险长上下文场景</span></span>
<span class="line"><span>需要精确控制 context window 的模型调用</span></span></code></pre></div><p>工程上可以把两种方法结合起来：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>构建上下文过程中：</span></span>
<span class="line"><span>  用估算方法快速判断是否接近阈值。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>准备调用模型前：</span></span>
<span class="line"><span>  用 tokenizer 做一次更准确的 token count。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>如果超过阈值：</span></span>
<span class="line"><span>  先做微压缩。</span></span>
<span class="line"><span>  还不够，再做 session_memory 替换。</span></span>
<span class="line"><span>  最后才触发完整 compact。</span></span></code></pre></div><p>这样可以避免两个问题：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 压缩太早</span></span>
<span class="line"><span>   明明上下文还放得下，却频繁压缩，导致信息损失和额外成本。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 压缩太晚</span></span>
<span class="line"><span>   请求已经超过 context window，模型调用失败，或者不得不临时做大规模 compact。</span></span></code></pre></div><p>一个比较稳的判断方式是预留安全余量：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>context_window = 128k</span></span>
<span class="line"><span>reserved_output = 8k</span></span>
<span class="line"><span>safety_margin = 4k</span></span>
<span class="line"><span>usable_input = 128k - 8k - 4k</span></span></code></pre></div><p>也就是说，不能等输入真的接近 <code>128k</code> 才压缩，而要提前扣掉模型输出和误差空间。</p><p>还有一个细节也很重要：</p><blockquote><p>API 虽然按 JSON 键值对解析请求，但最终喂给模型的不是原始 JSON，而是一段“展开后”的纯文本 token 序列。</p></blockquote><p>可以把中间过程理解成有一个格式化渲染器：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>HTTP JSON payload</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>API 服务端解析 role / messages / tools / 参数</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>渲染成模型能消费的线性文本</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>tokenize</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>进入模型上下文</span></span></code></pre></div><p>例如，原始工具 schema 可能是：</p><div class="language-json vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">json</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">{</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#005CC5", "--shiki-dark": "#79B8FF" })}">  &quot;name&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">: </span><span style="${ssrRenderStyle({ "--shiki-light": "#032F62", "--shiki-dark": "#9ECBFF" })}">&quot;web_search&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">,</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#005CC5", "--shiki-dark": "#79B8FF" })}">  &quot;description&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">: </span><span style="${ssrRenderStyle({ "--shiki-light": "#032F62", "--shiki-dark": "#9ECBFF" })}">&quot;Search the web...&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">,</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#005CC5", "--shiki-dark": "#79B8FF" })}">  &quot;parameters&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">: {}</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">}</span></span></code></pre></div><p>渲染后模型实际接收到的可能更像：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>&lt;function&gt;</span></span>
<span class="line"><span>name: web_search</span></span>
<span class="line"><span>description: Search the web for current information and return sourced results.</span></span>
<span class="line"><span>parameters:</span></span>
<span class="line"><span>  - query (string, required): Search query for current external information.</span></span>
<span class="line"><span>  - num_results (integer): Number of search results to return. Default 8, max 20.</span></span>
<span class="line"><span>&lt;/function&gt;</span></span></code></pre></div><p><code>messages</code> 里的每条消息也会被加上角色边界：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>&lt;system&gt;</span></span>
<span class="line"><span>你是 tracemem 中的长期协作型个人助手...</span></span>
<span class="line"><span>&lt;/system&gt;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>&lt;user&gt;</span></span>
<span class="line"><span>帮我找找 codex 为什么最新版本用不了</span></span>
<span class="line"><span>&lt;/user&gt;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>&lt;assistant&gt;</span></span>
<span class="line"><span>[模型发起了 web_search 调用，查询 &quot;Codex 最新版本 用不了 问题 2025&quot;]</span></span>
<span class="line"><span>&lt;/assistant&gt;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>&lt;tool_result&gt;</span></span>
<span class="line"><span>搜索结果：1. 隆重介绍升级版 Codex...</span></span>
<span class="line"><span>&lt;/tool_result&gt;</span></span></code></pre></div><p>原因是：</p><blockquote><p>大模型本质上消费的是文本 token，不是 JSON 对象。<code>role</code>、<code>name</code>、<code>parameters</code> 这些结构化字段，最后都要被转成模型能“读”的线性文本，才能参与注意力计算和下一个 token 的预测。</p></blockquote><p>这对 token 预算有两个影响：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. token 计费通常按渲染后的文本计算</span></span>
<span class="line"><span>   不是按原始 JSON 字符数直接计算。</span></span>
<span class="line"><span>   渲染过程会增加分隔符、角色标记、工具标记等额外 token。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. prompt cache 通常也是基于渲染后的文本前缀</span></span>
<span class="line"><span>   只要 system prompt 渲染结果不变，就更容易命中缓存。</span></span>
<span class="line"><span>   JSON 键顺序本身未必重要，关键是最终渲染出的文本是否稳定。</span></span></code></pre></div><p>所以估算 token 时不能只看原始 JSON 长度，还要意识到：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>messages 会被加上 role 边界。</span></span>
<span class="line"><span>tools schema 会被展开成工具说明。</span></span>
<span class="line"><span>tool result 也会以某种边界形式进入上下文。</span></span></code></pre></div><p>这也是为什么 tokenizer 精确计算最好尽量贴近“最终发送给模型的渲染结果”。如果拿不到 API 内部渲染结果，就需要给估算值留安全余量。</p><p>一句话记：</p><blockquote><p>估算 token 用来快速预警，tokenizer 用来精确决策；两者配合，才能让上下文压缩在正确的时候发生。</p></blockquote><h2 id="当前整理后的重点" tabindex="-1">当前整理后的重点 <a class="header-anchor" href="#当前整理后的重点" aria-label="Permalink to &quot;当前整理后的重点&quot;">​</a></h2><p>现在这些笔记可以先按这条主线串起来：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>单轮流程</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>HTTP payload 结构</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>messages / tools 职责边界</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>memory 检索与注入</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>工具结果回填</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>上下文压缩与 compact</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>历史记录和长期记忆写入</span></span></code></pre></div><p>也就是说，后面如果继续整理，可以优先补这几块：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. runtime context 具体包含哪些字段</span></span>
<span class="line"><span>2. history messages 如何裁剪</span></span>
<span class="line"><span>3. retrieved_memory 如何排序和注入</span></span>
<span class="line"><span>4. tool result 如何回填、清理和压缩</span></span>
<span class="line"><span>5. token 预算如何估算和精确计算</span></span>
<span class="line"><span>6. compact 后哪些磁盘记忆会重新注入</span></span></code></pre></div><h2 id="一句话总结" tabindex="-1">一句话总结 <a class="header-anchor" href="#一句话总结" aria-label="Permalink to &quot;一句话总结&quot;">​</a></h2><blockquote><p>上下文管理的核心不是把所有信息都塞给模型，而是把信息放到正确的位置，并在窗口压力变大时有层次地降级。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("topics/agent/上下文管理.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const _____ = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  _____ as default
};
