import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"大模型的主要部分","description":"","frontmatter":{},"headers":[],"relativePath":"topics/llm/大模型的主要部分.md","filePath":"topics/llm/大模型的主要部分.md"}');
const _sfc_main = { name: "topics/llm/大模型的主要部分.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="大模型的主要部分" tabindex="-1">大模型的主要部分 <a class="header-anchor" href="#大模型的主要部分" aria-label="Permalink to &quot;大模型的主要部分&quot;">​</a></h1><p>学习大模型时，不一定一开始就把所有训练细节都展开。</p><p>如果目标是理解模型怎么被使用、怎么推理、怎么和应用连接，可以先抓住几块主线：架构、分词、注意力和采样。</p><h2 id="架构" tabindex="-1">架构 <a class="header-anchor" href="#架构" aria-label="Permalink to &quot;架构&quot;">​</a></h2><p>架构回答的是：模型长什么样。</p><p>比如它是 BERT、T5 还是 GPT 这一类结构。不同结构决定了模型适合做什么任务，也决定了它在输入输出上的基本方式。</p><p>对于现在常见的大语言模型，重点通常是 decoder-only Transformer。</p><p>这部分不用一开始钻太深，但要知道模型大概由哪些模块组成，数据在里面怎么流动。</p><h2 id="分词" tabindex="-1">分词 <a class="header-anchor" href="#分词" aria-label="Permalink to &quot;分词&quot;">​</a></h2><p>分词回答的是：文本怎么变成模型能处理的数字。</p><p>模型不能直接处理自然语言文本，它处理的是 token id。分词器会把文本切成 token，再映射成数字，然后进入 embedding 和后续模型结构。</p><p>这部分很值得重点关注，因为它直接影响：</p><ul><li>上下文长度怎么算</li><li>中文、英文、代码的 token 数差异</li><li>为什么同一段文本在不同模型里 token 数不同</li><li>为什么 prompt 成本和 token 数有关</li></ul><h2 id="注意力" tabindex="-1">注意力 <a class="header-anchor" href="#注意力" aria-label="Permalink to &quot;注意力&quot;">​</a></h2><p>注意力回答的是：模型怎么在上下文中建立 token 之间的关系。</p><p>可以先从 self-attention 开始理解，再理解 masked self-attention 和 multi-head attention。</p><p>注意力机制最好能手写一遍公式：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>score = QK^T / sqrt(d)</span></span>
<span class="line"><span>prob = softmax(score)</span></span>
<span class="line"><span>out = prob V</span></span></code></pre></div><p>如果是自回归大模型，还要理解 mask 的作用：当前位置不能看到未来 token。</p><h2 id="采样" tabindex="-1">采样 <a class="header-anchor" href="#采样" aria-label="Permalink to &quot;采样&quot;">​</a></h2><p>采样回答的是：模型算出下一个 token 的概率后，怎么真正生成文本。</p><p>模型最后会输出一个词表上的概率分布，但生成时不一定永远选择概率最高的 token。不同采样策略会影响输出的稳定性、多样性和随机性。</p><p>这部分也很值得重点关注，因为它和实际使用模型关系很近：</p><ul><li>temperature</li><li>top-k</li><li>top-p</li><li>greedy decoding</li><li>beam search</li></ul><p>理解采样，才能理解为什么同一个 prompt 有时会生成不同答案，也能更好地控制模型输出。</p><h2 id="当前学习重点" tabindex="-1">当前学习重点 <a class="header-anchor" href="#当前学习重点" aria-label="Permalink to &quot;当前学习重点&quot;">​</a></h2><p>如果只是为了使用和理解大模型，可以先重点关注：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>分词</span></span>
<span class="line"><span>采样</span></span>
<span class="line"><span>注意力机制</span></span></code></pre></div><p>架构和训练当然重要，但很多细节会在预训练和模型实现里被封装起来。对于应用层学习来说，先理解输入怎么变成 token、上下文怎么被建模、输出怎么被采样，会更直接。</p><p>注意力机制需要能手写，因为它是理解 Transformer 的核心入口。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("topics/llm/大模型的主要部分.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const ________ = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  ________ as default
};
