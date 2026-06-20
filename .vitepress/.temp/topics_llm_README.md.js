import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"LLM","description":"","frontmatter":{},"headers":[],"relativePath":"topics/llm/README.md","filePath":"topics/llm/README.md"}');
const _sfc_main = { name: "topics/llm/README.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="llm" tabindex="-1">LLM <a class="header-anchor" href="#llm" aria-label="Permalink to &quot;LLM&quot;">​</a></h1><p>这里放模型、API、payload、微调和推理相关笔记。</p><p>不放 Agent 运行机制；Agent 上下文、安全、工具边界放到 <a href="./../agent/README">topics/agent</a>。外部论文和仓库原文优先放 <code>reference/</code>，但 QLoRA 当前学习资料暂时保留在本目录，避免破坏已有阅读路径。</p><h2 id="当前笔记" tabindex="-1">当前笔记 <a class="header-anchor" href="#当前笔记" aria-label="Permalink to &quot;当前笔记&quot;">​</a></h2><ul><li><a href="./DeepSeek HTTP payload 结构">DeepSeek HTTP payload 结构</a>：模型 API 请求中 <code>messages</code>、<code>tools</code>、控制字段的职责边界。</li><li><a href="./大模型的主要部分">大模型的主要部分</a>：架构、分词、注意力和采样这几条学习主线。</li><li><a href="./大模型的 Transformer 架构">大模型的 Transformer 架构</a>：decoder-only Transformer、masked attention 和 softmax 的基本理解。</li><li><a href="./pretraining/README">大模型预训练</a>：数据格式、tokenizer、dataloader、<code>x/y</code> 构造、embedding 和 bpb 指标。</li><li><a href="./QLoRA/README">QLoRA 学习资料</a>：QLoRA / LoRA 的一手论文、官方仓库和官方文档入口。</li></ul></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("topics/llm/README.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const README = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  README as default
};
