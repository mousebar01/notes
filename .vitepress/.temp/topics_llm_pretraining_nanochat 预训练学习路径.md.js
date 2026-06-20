import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"","description":"","frontmatter":{},"headers":[],"relativePath":"topics/llm/pretraining/nanochat 预训练学习路径.md","filePath":"topics/llm/pretraining/nanochat 预训练学习路径.md"}');
const _sfc_main = { name: "topics/llm/pretraining/nanochat 预训练学习路径.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><p>完全同意。你现在这个判断很对。</p><p>玩具实验阶段，最重要的不是“怎么把 bpb 再压低 0.1”，而是把整条链路在脑子里接起来：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>原始文本</span></span>
<span class="line"><span>-&gt; parquet 数据 shard</span></span>
<span class="line"><span>-&gt; tokenizer 训练</span></span>
<span class="line"><span>-&gt; tokenizer 编码文本</span></span>
<span class="line"><span>-&gt; dataloader 拼 batch</span></span>
<span class="line"><span>-&gt; GPT forward</span></span>
<span class="line"><span>-&gt; next-token prediction loss</span></span>
<span class="line"><span>-&gt; backward</span></span>
<span class="line"><span>-&gt; optimizer 更新参数</span></span>
<span class="line"><span>-&gt; eval validation bpb</span></span>
<span class="line"><span>-&gt; save checkpoint</span></span>
<span class="line"><span>-&gt; sample / SFT / chat</span></span></code></pre></div><p>调参经验当然有用，但它应该排在后面。现在更值得学的是这些问题：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. 数据到底长什么样？</span></span>
<span class="line"><span>2. tokenizer 是怎么从文本学出 vocab 的？</span></span>
<span class="line"><span>3. 一个 batch 里的 x/y 是什么关系？</span></span>
<span class="line"><span>4. 模型输入输出 shape 是什么？</span></span>
<span class="line"><span>5. loss 是怎么计算的？</span></span>
<span class="line"><span>6. checkpoint 里保存了什么？</span></span>
<span class="line"><span>7. base model 和 chat model 差别是什么？</span></span>
<span class="line"><span>8. 预训练和 SFT 各自改变了什么？</span></span></code></pre></div><p>我建议你接下来按源码顺序读，而不是继续盲跑：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>第一步：nanochat/nanochat/dataset.py</span></span>
<span class="line"><span>第二步：nanochat/scripts/tok_train.py</span></span>
<span class="line"><span>第三步：nanochat/nanochat/tokenizer.py</span></span>
<span class="line"><span>第四步：nanochat/nanochat/dataloader.py</span></span>
<span class="line"><span>第五步：nanochat/nanochat/gpt.py</span></span>
<span class="line"><span>第六步：nanochat/scripts/base_train.py</span></span>
<span class="line"><span>第七步：nanochat/scripts/base_eval.py</span></span>
<span class="line"><span>第八步：nanochat/scripts/chat_sft.py</span></span></code></pre></div><p>读的时候不要追求一次读懂全部。每个文件只抓一个问题：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>dataset.py：数据从哪里来，保存到哪里？</span></span>
<span class="line"><span>tok_train.py：tokenizer 用哪些文本训练，保存什么？</span></span>
<span class="line"><span>tokenizer.py：字符串怎么变成 token id？</span></span>
<span class="line"><span>dataloader.py：如何把文档拼成 x/y？</span></span>
<span class="line"><span>gpt.py：模型结构是什么？</span></span>
<span class="line"><span>base_train.py：训练循环怎么跑？</span></span>
<span class="line"><span>base_eval.py：bpb 怎么算？</span></span>
<span class="line"><span>chat_sft.py：聊天格式怎么教给模型？</span></span></code></pre></div><p>下一步我建议我们从 <code>dataset.py</code> 开始，我可以带你逐段读：先看数据下载、文件组织、train/val 划分，然后看 parquet 里每条样本是什么。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("topics/llm/pretraining/nanochat 预训练学习路径.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const nanochat________ = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  nanochat________ as default
};
