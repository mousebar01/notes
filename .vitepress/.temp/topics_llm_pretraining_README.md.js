import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"大模型预训练","description":"","frontmatter":{},"headers":[],"relativePath":"topics/llm/pretraining/README.md","filePath":"topics/llm/pretraining/README.md"}');
const _sfc_main = { name: "topics/llm/pretraining/README.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="大模型预训练" tabindex="-1">大模型预训练 <a class="header-anchor" href="#大模型预训练" aria-label="Permalink to &quot;大模型预训练&quot;">​</a></h1><p>这里放大模型预训练链路相关笔记，重点是把数据、tokenizer、dataloader、训练目标和评估指标串起来。</p><h2 id="建议阅读顺序" tabindex="-1">建议阅读顺序 <a class="header-anchor" href="#建议阅读顺序" aria-label="Permalink to &quot;建议阅读顺序&quot;">​</a></h2><ol><li><a href="./预训练数据格式">预训练数据格式</a>：CSV、JSON、JSONL、Parquet 的区别，以及为什么大规模训练数据常用 Parquet。</li><li><a href="./Tokenizer 与 Embedding">Tokenizer 与 Embedding</a>：文本如何变成 token id，token id 又如何通过 embedding 变成向量。</li><li><a href="./预训练的自监督形式">预训练的自监督形式</a>：为什么预训练更准确叫自监督，以及 <code>x/y</code> 是怎么由 token 序列右移得到的。</li><li><a href="./nanochat 预训练学习路径">nanochat 预训练学习路径</a>：阅读 nanochat 预训练源码时，可以按哪些文件和问题推进。</li><li><a href="./Validation bpb 指标">Validation bpb 指标</a>：nanochat 里 <code>bpb</code> 指标的含义，以及如何看训练趋势。</li></ol><h2 id="当前主线" tabindex="-1">当前主线 <a class="header-anchor" href="#当前主线" aria-label="Permalink to &quot;当前主线&quot;">​</a></h2><p>预训练可以先按这条链路理解：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>原始文本</span></span>
<span class="line"><span>-&gt; 数据文件 / shard</span></span>
<span class="line"><span>-&gt; tokenizer 训练与编码</span></span>
<span class="line"><span>-&gt; dataloader 组织 batch</span></span>
<span class="line"><span>-&gt; 构造 x 和 y</span></span>
<span class="line"><span>-&gt; embedding</span></span>
<span class="line"><span>-&gt; Transformer forward</span></span>
<span class="line"><span>-&gt; next-token prediction loss</span></span>
<span class="line"><span>-&gt; backward</span></span>
<span class="line"><span>-&gt; optimizer 更新参数</span></span>
<span class="line"><span>-&gt; validation bpb / checkpoint / sample</span></span></code></pre></div><p>这组笔记暂时不追求覆盖所有预训练细节，先把最小闭环讲清楚。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("topics/llm/pretraining/README.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const README = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  README as default
};
