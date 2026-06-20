import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Reviews","description":"","frontmatter":{},"headers":[],"relativePath":"reviews/README.md","filePath":"reviews/README.md"}');
const _sfc_main = { name: "reviews/README.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="reviews" tabindex="-1">Reviews <a class="header-anchor" href="#reviews" aria-label="Permalink to &quot;Reviews&quot;">​</a></h1><p>这里用于放复盘、阶段总结、项目总结和过程回顾。</p><p>适合记录：</p><ul><li>当时的背景</li><li>发生了什么</li><li>做过哪些判断</li><li>结果如何</li><li>后续还能怎么改进</li></ul></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("reviews/README.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const README = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  README as default
};
