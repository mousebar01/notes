import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Archive","description":"","frontmatter":{},"headers":[],"relativePath":"archive/README.md","filePath":"archive/README.md"}');
const _sfc_main = { name: "archive/README.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="archive" tabindex="-1">Archive <a class="header-anchor" href="#archive" aria-label="Permalink to &quot;Archive&quot;">​</a></h1><p>这里用于放已经整理归档、暂时不常用但仍需要保留的旧内容。</p><p>归档不等于删除。放到这里的内容以后仍然可以通过索引重新找回。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("archive/README.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const README = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  README as default
};
