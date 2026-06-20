import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Docs","description":"","frontmatter":{},"headers":[],"relativePath":"reference/docs/README.md","filePath":"reference/docs/README.md"}');
const _sfc_main = { name: "reference/docs/README.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="docs" tabindex="-1">Docs <a class="header-anchor" href="#docs" aria-label="Permalink to &quot;Docs&quot;">​</a></h1><p>这里放官方文档快照或官方文档资料索引。</p><p>不确定来源是否官方时，先放到 <code>reference/articles/</code> 或在索引里标注待确认。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("reference/docs/README.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const README = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  README as default
};
