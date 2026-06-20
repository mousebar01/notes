import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"大模型的 Transformer 架构","description":"","frontmatter":{},"headers":[],"relativePath":"topics/llm/大模型的 Transformer 架构.md","filePath":"topics/llm/大模型的 Transformer 架构.md"}');
const _sfc_main = { name: "topics/llm/大模型的 Transformer 架构.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="大模型的-transformer-架构" tabindex="-1">大模型的 Transformer 架构 <a class="header-anchor" href="#大模型的-transformer-架构" aria-label="Permalink to &quot;大模型的 Transformer 架构&quot;">​</a></h1><p>这篇记录 decoder-only Transformer 的基本结构，以及 masked self-attention 和 softmax 的直觉。</p><h2 id="整体流程" tabindex="-1">整体流程 <a class="header-anchor" href="#整体流程" aria-label="Permalink to &quot;整体流程&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Token 输入 id</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>Embedding</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>Transformer Decoder Block × N</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>Final LayerNorm</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>LM Head</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>预测下一个 token</span></span></code></pre></div><p>大模型通常是 decoder-only Transformer 架构。</p><p>输入主要通过分词和向量化实现。这样做的目的是支持自回归生成：后一个 token 的输出取决于前面的 token。</p><p>在大模型结构里说的 Embedding 层，通常指的是最前面的：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>token id -&gt; token vector</span></span></code></pre></div><h2 id="decoder-block-的结构" tabindex="-1">Decoder Block 的结构 <a class="header-anchor" href="#decoder-block-的结构" aria-label="Permalink to &quot;Decoder Block 的结构&quot;">​</a></h2><p>一个简化的 decoder block 可以理解为：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>x</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├───────────────┐</span></span>
<span class="line"><span>│               │</span></span>
<span class="line"><span>↓               │</span></span>
<span class="line"><span>RMSNorm / LayerNorm</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>Masked Self-Attention</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>Residual Add</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>├───────────────┐</span></span>
<span class="line"><span>│               │</span></span>
<span class="line"><span>↓               │</span></span>
<span class="line"><span>RMSNorm / LayerNorm</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>MLP / FFN</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>Residual Add</span></span>
<span class="line"><span>│</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>output</span></span></code></pre></div><p>核心组件包括：</p><ul><li>Norm：稳定训练和数值分布。</li><li>Masked Self-Attention：让当前位置只能看见自己和之前的 token。</li><li>MLP / FFN：对每个 token 的表示做非线性变换。</li><li>Residual Add：保留原始信息，缓解深层网络训练问题。</li></ul><h2 id="attention-公式" tabindex="-1">Attention 公式 <a class="header-anchor" href="#attention-公式" aria-label="Permalink to &quot;Attention 公式&quot;">​</a></h2><p>普通 attention 是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>score = QK^T / sqrt(d)</span></span>
<span class="line"><span>prob = softmax(score)</span></span>
<span class="line"><span>out = prob V</span></span></code></pre></div><p>掩码注意力是在 softmax 前加 mask：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>score = QK^T / sqrt(d)</span></span>
<span class="line"><span>score = score + mask</span></span>
<span class="line"><span>prob = softmax(score)</span></span>
<span class="line"><span>out = prob V</span></span></code></pre></div><p>mask 的作用是让未来 token 的注意力权重变成 0。</p><h2 id="self-attention-和-multi-head-attention" tabindex="-1">Self-Attention 和 Multi-Head Attention <a class="header-anchor" href="#self-attention-和-multi-head-attention" aria-label="Permalink to &quot;Self-Attention 和 Multi-Head Attention&quot;">​</a></h2><p>Self-attention 指的是同一段序列内部的 token 彼此计算注意力。</p><p>也就是说，<code>Q</code>、<code>K</code>、<code>V</code> 都来自同一个输入序列，只是经过不同的线性变换。它要解决的问题是：当前位置应该从上下文中的哪些位置拿信息。</p><p>Multi-head attention 可以先粗略理解为：把隐藏层维度拆成多个 head，每个 head 各自做一遍 self-attention，然后再把结果拼接起来。</p><p>这样做的直觉是，不同 head 可以关注不同类型的关系。比如有的 head 更关注局部相邻 token，有的 head 更关注长距离依赖，有的 head 可能更关注语法或结构线索。</p><p>一个简化流程是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>hidden state</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>拆成多个 head</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>每个 head 分别计算 self-attention</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>拼接多个 head 的结果</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>线性变换回原来的 hidden size</span></span></code></pre></div><p>所以，多头注意力不是多个模型，而是在同一层里让模型从多个子空间并行观察上下文关系。</p><h2 id="softmax" tabindex="-1">Softmax <a class="header-anchor" href="#softmax" aria-label="Permalink to &quot;Softmax&quot;">​</a></h2><p>Softmax 会把一组任意实数变成一个概率分布。</p><p>如果输入是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>z = [z_1, z_2, ..., z_n]</span></span></code></pre></div><p>那么输出是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>p_i = exp(z_i) / sum_j exp(z_j)</span></span></code></pre></div><p>并且：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>sum_i p_i = 1</span></span></code></pre></div><p>举个例子：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>z = [2, 1, 0]</span></span>
<span class="line"><span>softmax(z) ≈ [0.665, 0.245, 0.090]</span></span></code></pre></div><h2 id="注意力里的-softmax" tabindex="-1">注意力里的 softmax <a class="header-anchor" href="#注意力里的-softmax" aria-label="Permalink to &quot;注意力里的 softmax&quot;">​</a></h2><p>在注意力机制里，如果第 <code>i</code> 个 token 对所有 token 的打分是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>S_i = [S_i1, S_i2, ..., S_in]</span></span></code></pre></div><p>那么 softmax 后：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>A_ij = exp(S_ij) / sum_t exp(S_it)</span></span></code></pre></div><p>这里的 <code>A_ij</code> 表示：</p><blockquote><p>第 <code>i</code> 个 token 分配给第 <code>j</code> 个 token 的注意力权重。</p></blockquote><h2 id="masked-attention" tabindex="-1">Masked Attention <a class="header-anchor" href="#masked-attention" aria-label="Permalink to &quot;Masked Attention&quot;">​</a></h2><p>如果是带 mask 的 attention：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>A_ij = exp(S_ij + M_ij) / sum_t exp(S_it + M_it)</span></span></code></pre></div><p>其中：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>M_ij = 0       表示允许关注</span></span>
<span class="line"><span>M_ij = -inf    表示不允许关注</span></span></code></pre></div><p>如果某个位置被 mask：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>M_ij = -inf</span></span></code></pre></div><p>那么：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>exp(S_ij + M_ij) = exp(-inf) = 0</span></span></code></pre></div><p>所以这个位置的注意力权重就是 0。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("topics/llm/大模型的 Transformer 架构.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const _____Transformer___ = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  _____Transformer___ as default
};
