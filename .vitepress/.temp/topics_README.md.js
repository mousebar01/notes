import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Topics","description":"","frontmatter":{},"headers":[],"relativePath":"topics/README.md","filePath":"topics/README.md"}');
const _sfc_main = { name: "topics/README.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="topics" tabindex="-1">Topics <a class="header-anchor" href="#topics" aria-label="Permalink to &quot;Topics&quot;">​</a></h1><p>这里放通用知识笔记，适合沉淀跨项目复用的概念、方法、技术理解和学习记录。</p><p>不放外部资料原文；外部仓库、论文、官方文档放到 <code>reference/</code>。不放具体长期项目推进记录；项目相关内容放到 <code>projects/</code>。</p><h2 id="当前主题" tabindex="-1">当前主题 <a class="header-anchor" href="#当前主题" aria-label="Permalink to &quot;当前主题&quot;">​</a></h2><ul><li><a href="./agent/README">Agent</a>：Agent 上下文、安全、工具边界等通用知识。</li><li><a href="./llm/README">LLM</a>：模型 API、payload、微调和推理相关笔记。</li><li><a href="./ai-coding/README">AI Coding</a>：AI 编程使用心得和上下文组织。</li><li><a href="./learning/README">Learning</a>：学习方法、知识管理、记录复盘和主动输出。</li><li><a href="./software-engineering/README">Software Engineering</a>：软件工程、工程设计和排查经验。</li><li><a href="./algorithms/README">Algorithms</a>：算法学习和工程实现笔记。</li></ul></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("topics/README.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const README = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  README as default
};
