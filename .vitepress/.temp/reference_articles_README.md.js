import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Articles","description":"","frontmatter":{},"headers":[],"relativePath":"reference/articles/README.md","filePath":"reference/articles/README.md"}');
const _sfc_main = { name: "reference/articles/README.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="articles" tabindex="-1">Articles <a class="header-anchor" href="#articles" aria-label="Permalink to &quot;Articles&quot;">​</a></h1><p>这里放网页文章、博客和非官方资料。</p><p>如果资料后来确认是官方文档，可以再移动到 <code>reference/docs/</code>。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("reference/articles/README.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const README = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  README as default
};
