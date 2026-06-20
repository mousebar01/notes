import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"LoRA 的概念","description":"","frontmatter":{},"headers":[],"relativePath":"topics/llm/QLoRA/LoRA 的概念.md","filePath":"topics/llm/QLoRA/LoRA 的概念.md"}');
const _sfc_main = { name: "topics/llm/QLoRA/LoRA 的概念.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="lora-的概念" tabindex="-1">LoRA 的概念 <a class="header-anchor" href="#lora-的概念" aria-label="Permalink to &quot;LoRA 的概念&quot;">​</a></h1><p>LoRA 的英文全称是 Low-Rank Adaptation，通常翻译为“低秩适配”。</p><p>它的核心做法是：冻结大模型原有参数，只引入一小部分可学习的低秩参数来完成微调。相比全量微调，LoRA 的训练开销和存储开销都低得多。</p><h2 id="为什么-lora-有效" tabindex="-1">为什么 LoRA 有效 <a class="header-anchor" href="#为什么-lora-有效" aria-label="Permalink to &quot;为什么 LoRA 有效&quot;">​</a></h2><p>大模型通常存在过参数化现象。虽然模型参数规模很大，但在适配某个具体任务时，并不一定需要更新所有参数。</p><p>很多研究表明，模型完成特定任务所需的有效参数变化，往往集中在一个低维子空间中。也就是说，真正决定任务适配效果的更新方向并不多。</p><p>LoRA 正是利用了这一点：它不直接对原始权重矩阵进行全量更新，而是把权重增量表示为两个低秩矩阵的乘积：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>ΔW = B A</span></span></code></pre></div><p>其中秩 <code>r</code> 通常远小于原始矩阵维度。这样，LoRA 只需要训练少量参数，就能近似表达微调所需的主要更新方向。</p><p>所以，LoRA 有效的核心原因是：对于很多下游任务，模型不需要在完整参数空间中自由调整，只需要沿着少数关键方向进行低秩更新，就可以获得接近全参数微调的效果。</p><h2 id="易错理解" tabindex="-1">易错理解 <a class="header-anchor" href="#易错理解" aria-label="Permalink to &quot;易错理解&quot;">​</a></h2><p>低秩的意思是完成某个任务的有效更新方向很少，而不是简单地说“参数量很少”。</p><p>LoRA 很有价值的一点是：一个大模型底座可以共享，多个任务只保存各自很小的 LoRA adapter。</p><p>由于 LoRA 是线性增量设计，adapter 权重也比较容易和原始权重合并。</p><h2 id="在-transformer-里的位置" tabindex="-1">在 Transformer 里的位置 <a class="header-anchor" href="#在-transformer-里的位置" aria-label="Permalink to &quot;在 Transformer 里的位置&quot;">​</a></h2><p>LoRA 在 Transformer 里通常只加到注意力层的部分矩阵，比如 <code>Wq</code> 和 <code>Wv</code>，而不是训练整个模型。</p><p>直觉上可以这样理解：注意力层决定模型在生成时应该关注哪些 token，因此对任务适配很关键。</p><p>后续实践中，LoRA 也可以扩展到更多模块，例如 <code>q_proj</code>、<code>k_proj</code>、<code>v_proj</code>、<code>o_proj</code>，甚至 MLP 里的 <code>gate_proj</code>、<code>up_proj</code>、<code>down_proj</code>。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("topics/llm/QLoRA/LoRA 的概念.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const LoRA____ = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  LoRA____ as default
};
