import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Reference","description":"","frontmatter":{},"headers":[],"relativePath":"reference/README.md","filePath":"reference/README.md"}');
const _sfc_main = { name: "reference/README.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="reference" tabindex="-1">Reference <a class="header-anchor" href="#reference" aria-label="Permalink to &quot;Reference&quot;">​</a></h1><p>这里保存外部资料原文，包括仓库、论文、官方文档和网页文章。</p><p>不要在这里大幅改写外部资料；如果要总结，应另写到 <code>topics/</code> 或 <code>projects/</code> 的对应笔记中，并链接回原文。</p><h2 id="当前结构" tabindex="-1">当前结构 <a class="header-anchor" href="#当前结构" aria-label="Permalink to &quot;当前结构&quot;">​</a></h2><ul><li><code>repos/</code>：外部仓库原文或下载副本。</li><li><code>papers/</code>：论文 PDF 或论文笔记入口。</li><li><code>docs/</code>：官方文档快照。</li><li><code>articles/</code>：网页文章和非官方资料。</li></ul></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("reference/README.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const README = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  README as default
};
