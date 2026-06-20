import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Papers","description":"","frontmatter":{},"headers":[],"relativePath":"reference/papers/README.md","filePath":"reference/papers/README.md"}');
const _sfc_main = { name: "reference/papers/README.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="papers" tabindex="-1">Papers <a class="header-anchor" href="#papers" aria-label="Permalink to &quot;Papers&quot;">​</a></h1><p>这里放论文 PDF、论文原文和论文资料索引。</p><p>自己的阅读笔记可以放到对应主题目录，再链接回这里。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("reference/papers/README.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const README = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  README as default
};
