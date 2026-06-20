import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"大模型预训练为什么叫自监督","description":"","frontmatter":{},"headers":[],"relativePath":"topics/llm/pretraining/预训练的自监督形式.md","filePath":"topics/llm/pretraining/预训练的自监督形式.md"}');
const _sfc_main = { name: "topics/llm/pretraining/预训练的自监督形式.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="大模型预训练为什么叫自监督" tabindex="-1">大模型预训练为什么叫自监督 <a class="header-anchor" href="#大模型预训练为什么叫自监督" aria-label="Permalink to &quot;大模型预训练为什么叫自监督&quot;">​</a></h1><p>大模型预训练常被说成“无监督”，但从训练形式上看，它其实很像监督学习。</p><p>更准确的说法是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>自监督学习 self-supervised learning</span></span></code></pre></div><p>因为训练时确实有：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>输入 x</span></span>
<span class="line"><span>标签 y</span></span>
<span class="line"><span>loss</span></span>
<span class="line"><span>反向传播</span></span>
<span class="line"><span>梯度下降</span></span></code></pre></div><p>只是这里的 <code>y</code> 不是人工标注出来的，而是从原始文本自身构造出来的。</p><h2 id="数据进入模型的路径" tabindex="-1">数据进入模型的路径 <a class="header-anchor" href="#数据进入模型的路径" aria-label="Permalink to &quot;数据进入模型的路径&quot;">​</a></h2><p>预训练数据从原始文本到模型输入，大致会经过这条路径：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>原始文本</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>tokenizer 编码成 token id</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>dataloader 把 token id 组织成 batch</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>得到 x 和 y</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>送进 embedding 层</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>进入 Transformer</span></span></code></pre></div><p>这里最容易混淆的是 <code>dataloader</code> 这一步。它不是只负责“读取数据”，还会把连续的 token 序列切成模型训练需要的 <code>x</code> 和 <code>y</code>。</p><h2 id="x-和-y-怎么来" tabindex="-1">x 和 y 怎么来 <a class="header-anchor" href="#x-和-y-怎么来" aria-label="Permalink to &quot;x 和 y 怎么来&quot;">​</a></h2><p>假设一段文本经过 tokenizer 后变成 token 序列：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>[10, 20, 30, 40, 50]</span></span></code></pre></div><p>语言模型预训练的目标是预测下一个 token：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>看到 10，预测 20</span></span>
<span class="line"><span>看到 10 20，预测 30</span></span>
<span class="line"><span>看到 10 20 30，预测 40</span></span>
<span class="line"><span>看到 10 20 30 40，预测 50</span></span></code></pre></div><p>所以 dataloader 会构造：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>x = [10, 20, 30, 40]</span></span>
<span class="line"><span>y = [20, 30, 40, 50]</span></span></code></pre></div><p>也就是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>x[0] = 10  -&gt; y[0] = 20</span></span>
<span class="line"><span>x[1] = 20  -&gt; y[1] = 30</span></span>
<span class="line"><span>x[2] = 30  -&gt; y[2] = 40</span></span>
<span class="line"><span>x[3] = 40  -&gt; y[3] = 50</span></span></code></pre></div><p>一句话：</p><blockquote><p>大模型预训练没有人工标签，<code>y</code> 就是把原始 token 序列往右错一位得到的“下一个 token 答案”。</p></blockquote><h2 id="为什么每一步看到的-y-会变" tabindex="-1">为什么每一步看到的 y 会变 <a class="header-anchor" href="#为什么每一步看到的-y-会变" aria-label="Permalink to &quot;为什么每一步看到的 y 会变&quot;">​</a></h2><p>对同一段固定 token 序列来说，<code>x/y</code> 的对应关系不会变。</p><p>例如：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>原始序列: [10, 20, 30, 40, 50]</span></span>
<span class="line"><span>x:       [10, 20, 30, 40]</span></span>
<span class="line"><span>y:       [20, 30, 40, 50]</span></span></code></pre></div><p>这条样本的答案永远是固定的。</p><p>但训练时，dataloader 每一步不一定取到同一段文本。数据集中有很多片段：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>片段 A: [10, 20, 30, 40, 50]</span></span>
<span class="line"><span>片段 B: [99, 88, 77, 66, 55]</span></span>
<span class="line"><span>片段 C: [1, 5, 9, 13, 17]</span></span></code></pre></div><p>所以不同 step 可能是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>step 1:</span></span>
<span class="line"><span>x = [10, 20, 30, 40]</span></span>
<span class="line"><span>y = [20, 30, 40, 50]</span></span>
<span class="line"><span></span></span>
<span class="line"><span>step 2:</span></span>
<span class="line"><span>x = [99, 88, 77, 66]</span></span>
<span class="line"><span>y = [88, 77, 66, 55]</span></span>
<span class="line"><span></span></span>
<span class="line"><span>step 3:</span></span>
<span class="line"><span>x = [1, 5, 9, 13]</span></span>
<span class="line"><span>y = [5, 9, 13, 17]</span></span></code></pre></div><p>所以“看到的 y 会变”，不是因为同一段文本的标签变了，而是因为每一步抽到的数据片段不同。</p><p>可以理解成：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>同一道题，答案不变。</span></span>
<span class="line"><span>但每一步训练抽到的题不一样，所以答案也不一样。</span></span></code></pre></div><h2 id="nanochat-里的实现" tabindex="-1">nanochat 里的实现 <a class="header-anchor" href="#nanochat-里的实现" aria-label="Permalink to &quot;nanochat 里的实现&quot;">​</a></h2><p>在 nanochat 里，这个过程会多一个 buffer 切片步骤。它会先把很多文档 token 拼到一个长 buffer 里，再切成固定长度。</p><p>假设上下文长度 <code>T=4</code>，buffer 是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>row_buffer = [10, 20, 30, 40, 50]</span></span></code></pre></div><p>那就会切成：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>x = row_buffer[:4]  = [10, 20, 30, 40]</span></span>
<span class="line"><span>y = row_buffer[1:5] = [20, 30, 40, 50]</span></span></code></pre></div><p>本质仍然是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>x 是前 T 个 token</span></span>
<span class="line"><span>y 是后 T 个 token</span></span></code></pre></div><p>也就是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>y = x 整体右移一位后的目标</span></span></code></pre></div><h2 id="为什么不是传统监督学习" tabindex="-1">为什么不是传统监督学习 <a class="header-anchor" href="#为什么不是传统监督学习" aria-label="Permalink to &quot;为什么不是传统监督学习&quot;">​</a></h2><p>它和监督学习形式很像，因为模型看到 <code>x</code>，预测下一个 token，目标是 <code>y</code>，然后根据 loss 做反向传播。</p><p>但它又不是传统人工标注监督学习，因为 <code>y</code> 不需要人标注。</p><p>对比一下：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>传统监督学习：</span></span>
<span class="line"><span>图片 -&gt; 人工标签“猫”</span></span>
<span class="line"><span></span></span>
<span class="line"><span>自监督预训练：</span></span>
<span class="line"><span>前面的 token -&gt; 原文里的下一个 token</span></span></code></pre></div><p>也就是说：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>原始文本自己提供监督信号</span></span></code></pre></div><p>这也是为什么互联网文本可以直接用来训练语言模型。它不需要人工给每句话打标签，但训练目标仍然很明确：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>预测下一个 token</span></span></code></pre></div><h2 id="总结" tabindex="-1">总结 <a class="header-anchor" href="#总结" aria-label="Permalink to &quot;总结&quot;">​</a></h2><p>LLM 预训练不是传统人工标注的监督学习，也不是完全没有目标的无监督聚类。</p><p>更准确地说，它是自监督学习：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>从原始 token 序列里自动构造 x/y，</span></span>
<span class="line"><span>让模型根据前面的 token 预测下一个 token。</span></span></code></pre></div><p>理解 dataloader 很关键，因为在那里可以直接看到：所谓标签 <code>y</code>，其实就是从原文右移一位得到的。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("topics/llm/pretraining/预训练的自监督形式.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const _________ = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  _________ as default
};
