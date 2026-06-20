import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"AI Coding","description":"","frontmatter":{},"headers":[],"relativePath":"topics/ai-coding/README.md","filePath":"topics/ai-coding/README.md"}');
const _sfc_main = { name: "topics/ai-coding/README.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="ai-coding" tabindex="-1">AI Coding <a class="header-anchor" href="#ai-coding" aria-label="Permalink to &quot;AI Coding&quot;">​</a></h1><p>这里记录 AI 编程相关的心得、协作方式、上下文组织和使用范式。</p><p>不放软件工程通用原则；这类内容放到 <a href="./../software-engineering/README">software-engineering</a>。不放外部项目原文；外部仓库放到 <a href="./../../reference/repos/README">reference/repos</a>。</p><h2 id="当前笔记" tabindex="-1">当前笔记 <a class="header-anchor" href="#当前笔记" aria-label="Permalink to &quot;当前笔记&quot;">​</a></h2><ul><li><a href="./AI">AI Coding 的一些初步感想</a>：AI 编程中的定位、prompt、常见问题和使用范式。</li><li><a href="./渐进式披露">上下文压缩作为渐进式披露机制</a>：把上下文压缩理解为“总览 + 可展开线索”的机制。</li></ul><h2 id="外部参考" tabindex="-1">外部参考 <a class="header-anchor" href="#外部参考" aria-label="Permalink to &quot;外部参考&quot;">​</a></h2><ul><li><code>reference/repos/vibe-coding-cn/</code>：外部 AI coding / vibe coding 学习资料。</li></ul></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("topics/ai-coding/README.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const README = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  README as default
};
