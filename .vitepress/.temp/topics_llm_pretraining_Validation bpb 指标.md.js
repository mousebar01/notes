import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"","description":"","frontmatter":{},"headers":[],"relativePath":"topics/llm/pretraining/Validation bpb 指标.md","filePath":"topics/llm/pretraining/Validation bpb 指标.md"}');
const _sfc_main = { name: "topics/llm/pretraining/Validation bpb 指标.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><p><code>bpb</code> 是 <strong>bits per byte</strong>，可以理解成语言模型的验证集损失指标之一。</p><p>在 nanochat 里：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Validation bpb 越低越好</span></span></code></pre></div><p>它衡量的是：模型平均需要多少 bit 的信息量，才能预测/压缩原始文本里的 1 个 byte。</p><p>为什么不用普通 loss？因为不同 tokenizer 的词表大小不一样，普通 token-level loss 不太好直接比较。<code>bpb</code> 按 byte 归一化，更适合比较不同 tokenizer、不同模型、不同实验。</p><p>直觉上：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>bpb 高：模型预测文本很吃力</span></span>
<span class="line"><span>bpb 低：模型更懂数据分布，预测更准</span></span></code></pre></div><p>你 smoke run 里看到：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Step 00000 | Validation bpb: 3.547557</span></span>
<span class="line"><span>Step 00010 | Validation bpb: 3.579815</span></span>
<span class="line"><span>Step 00020 | Validation bpb: 3.460436</span></span></code></pre></div><p>说明最后比开始低一点，但因为只训练了 20 步，波动很正常。</p><p>你之后跑 <code>depth=12</code>，应该重点看：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Validation bpb 是否整体下降</span></span></code></pre></div><p>不用纠结每一次都下降，训练中它会抖；看几十/几百步的趋势。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("topics/llm/pretraining/Validation bpb 指标.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const Validation_bpb___ = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  Validation_bpb___ as default
};
