import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"AI Coding 外部资料索引","description":"","frontmatter":{},"headers":[],"relativePath":"topics/ai-coding/reference-notes.md","filePath":"topics/ai-coding/reference-notes.md"}');
const _sfc_main = { name: "topics/ai-coding/reference-notes.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="ai-coding-外部资料索引" tabindex="-1">AI Coding 外部资料索引 <a class="header-anchor" href="#ai-coding-外部资料索引" aria-label="Permalink to &quot;AI Coding 外部资料索引&quot;">​</a></h1><p>这里记录 AI Coding 相关外部资料的阅读入口和自己的简单备注。</p><h2 id="当前资料" tabindex="-1">当前资料 <a class="header-anchor" href="#当前资料" aria-label="Permalink to &quot;当前资料&quot;">​</a></h2><ul><li><code>reference/repos/vibe-coding-cn/</code><ul><li>来源：<code>tradecatlabs/vibe-coding-cn</code> 的 <code>develop</code> 分支下载副本。</li><li>用途：参考它的知识库结构、prompts / skills / tools 分层和目录级 <code>AGENTS.md</code> 规则。</li></ul></li></ul></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("topics/ai-coding/reference-notes.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const referenceNotes = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  referenceNotes as default
};
