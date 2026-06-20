import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"QLoRA 的概念","description":"","frontmatter":{},"headers":[],"relativePath":"topics/llm/QLoRA/QLoRA 的概念.md","filePath":"topics/llm/QLoRA/QLoRA 的概念.md"}');
const _sfc_main = { name: "topics/llm/QLoRA/QLoRA 的概念.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="qlora-的概念" tabindex="-1">QLoRA 的概念 <a class="header-anchor" href="#qlora-的概念" aria-label="Permalink to &quot;QLoRA 的概念&quot;">​</a></h1><p>QLoRA 不只是“LoRA + 4bit 量化”这么简单。它为了让低显存训练尽量不掉性能，做了几件关键工程设计。</p><p>可以先这样理解：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>QLoRA =</span></span>
<span class="line"><span>4-bit 量化底座模型</span></span>
<span class="line"><span>+ LoRA adapter 训练</span></span>
<span class="line"><span>+ 双重量化进一步省显存</span></span>
<span class="line"><span>+ 分页优化器防止显存峰值爆掉</span></span></code></pre></div><h2 id="_1-nf4-4-bit-normalfloat" tabindex="-1">1. NF4：4-bit NormalFloat <a class="header-anchor" href="#_1-nf4-4-bit-normalfloat" aria-label="Permalink to &quot;1. NF4：4-bit NormalFloat&quot;">​</a></h2><p>普通理解是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>FP16 / BF16 权重 -&gt; 4-bit 权重</span></span></code></pre></div><p>但 QLoRA 不是简单用 int4，而是用了 NF4，也就是 NormalFloat 4-bit。</p><p>原因是神经网络权重通常接近正态分布：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>W ~ N(0, sigma^2)</span></span></code></pre></div><p>大部分权重集中在 0 附近，极端大值比较少。</p><p>如果用普通 int4，它的 16 个取值通常比较均匀，例如：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>-8, -7, -6, ..., 6, 7</span></span></code></pre></div><p>但神经网络权重不是均匀分布的。所以 NF4 的想法是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>既然权重大多集中在 0 附近，</span></span>
<span class="line"><span>那就在 0 附近分配更密的量化点，</span></span>
<span class="line"><span>在两端分配更稀的量化点。</span></span></code></pre></div><p>这样更适合模型权重分布，量化误差更小。</p><p>论文里说 NF4 是“针对正态分布数据的信息论上最优量化数据类型”，可以理解为：NF4 是专门为接近正态分布的神经网络权重设计的 4-bit 表示方式，比普通 int4 更适合保存模型权重。</p><h2 id="_2-double-quantization-双重量化" tabindex="-1">2. Double Quantization：双重量化 <a class="header-anchor" href="#_2-double-quantization-双重量化" aria-label="Permalink to &quot;2. Double Quantization：双重量化&quot;">​</a></h2><p>量化不是只存一个 4-bit 数就完了，还需要存一些缩放系数。</p><p>比如一组 FP16 权重量化成 4-bit 时，通常要保存：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>4-bit 量化后的权重</span></span>
<span class="line"><span>+ scale / zero point 这类量化常数</span></span></code></pre></div><p>这些量化常数本身也要占显存。</p><p>Double Quantization 的思路是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>既然量化常数也占空间，</span></span>
<span class="line"><span>那我把量化常数也再量化一次。</span></span></code></pre></div><p>也就是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>原始权重 -&gt; 4-bit 量化</span></span>
<span class="line"><span>量化常数 -&gt; 再量化</span></span></code></pre></div><p>它解决的是一个细节问题：4-bit 权重已经很小了，但量化时附带的 scale 等常数仍然会带来额外开销。</p><p>论文里说平均每个参数节省约 <code>0.37 bit</code>。这个数字看起来很小，但模型很大时非常可观。</p><p>例如 65B 模型：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>650 亿参数 * 0.37 bit</span></span>
<span class="line"><span>≈ 240.5 亿 bit</span></span>
<span class="line"><span>≈ 3GB</span></span></code></pre></div><p>所以这不是理论小优化，而是真的能省好几 GB 显存。</p><h2 id="_3-paged-optimizer-分页优化器" tabindex="-1">3. Paged Optimizer：分页优化器 <a class="header-anchor" href="#_3-paged-optimizer-分页优化器" aria-label="Permalink to &quot;3. Paged Optimizer：分页优化器&quot;">​</a></h2><p>Paged Optimizer 主要解决训练时的显存峰值问题。</p><p>训练大模型时，显存不是一直稳定的。某些时刻会突然变高，比如：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>长序列</span></span>
<span class="line"><span>小 batch</span></span>
<span class="line"><span>gradient checkpointing</span></span>
<span class="line"><span>反向传播中重新计算激活</span></span>
<span class="line"><span>优化器状态更新</span></span></code></pre></div><p>这些可能导致一瞬间显存爆掉。</p><p>Paged Optimizer 的思路是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>显存不够时，把一部分优化器状态临时放到 CPU 内存里，</span></span>
<span class="line"><span>需要时再调回来。</span></span></code></pre></div><p>它用了 NVIDIA Unified Memory，可以把 GPU 显存和 CPU 内存做类似“分页”的管理。</p><p>所以它的作用不是主要降低平均显存，而是防止训练过程中某个瞬间显存峰值 OOM。</p><h2 id="_4-更广的-lora-adapter-覆盖" tabindex="-1">4. 更广的 LoRA adapter 覆盖 <a class="header-anchor" href="#_4-更广的-lora-adapter-覆盖" aria-label="Permalink to &quot;4. 更广的 LoRA adapter 覆盖&quot;">​</a></h2><p>早期 LoRA 论文里，很多实验主要只在注意力层的部分矩阵上加 LoRA，比如：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Wq</span></span>
<span class="line"><span>Wv</span></span></code></pre></div><p>但是 QLoRA 为了尽量减少性能损失，通常会在更多层、更多模块上加 LoRA adapter。</p><p>现代实践里常见：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>q_proj</span></span>
<span class="line"><span>k_proj</span></span>
<span class="line"><span>v_proj</span></span>
<span class="line"><span>o_proj</span></span>
<span class="line"><span>gate_proj</span></span>
<span class="line"><span>up_proj</span></span>
<span class="line"><span>down_proj</span></span></code></pre></div><p>也就是 Attention 模块加 LoRA，MLP 模块也加 LoRA。</p><p>原因是 QLoRA 把底座模型量化到了 4-bit，量化本身可能带来一点精度损失。为了弥补这个损失，它让 LoRA adapter 的覆盖范围更广。</p><h2 id="_5-lora-和-qlora-的区别" tabindex="-1">5. LoRA 和 QLoRA 的区别 <a class="header-anchor" href="#_5-lora-和-qlora-的区别" aria-label="Permalink to &quot;5. LoRA 和 QLoRA 的区别&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>LoRA:</span></span>
<span class="line"><span>base model 通常 FP16 / BF16 加载</span></span>
<span class="line"><span>冻结 base model</span></span>
<span class="line"><span>训练低秩 adapter</span></span>
<span class="line"><span></span></span>
<span class="line"><span>QLoRA:</span></span>
<span class="line"><span>base model 用 NF4 4-bit 加载</span></span>
<span class="line"><span>冻结 base model</span></span>
<span class="line"><span>训练低秩 adapter</span></span>
<span class="line"><span>进一步用 double quantization 省空间</span></span>
<span class="line"><span>用 paged optimizer 防止显存峰值</span></span>
<span class="line"><span>通常在更多层加 adapter 来保持效果</span></span></code></pre></div><p>一句话总结：</p><blockquote><p>LoRA 主要解决“训练参数太多”的问题；QLoRA 在 LoRA 基础上进一步解决“底座模型加载显存太大”和“训练显存峰值容易爆”的问题。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("topics/llm/QLoRA/QLoRA 的概念.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const QLoRA____ = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  QLoRA____ as default
};
