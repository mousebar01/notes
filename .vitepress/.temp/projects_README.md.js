import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Projects","description":"","frontmatter":{},"headers":[],"relativePath":"projects/README.md","filePath":"projects/README.md"}');
const _sfc_main = { name: "projects/README.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="projects" tabindex="-1">Projects <a class="header-anchor" href="#projects" aria-label="Permalink to &quot;Projects&quot;">​</a></h1><p>这里放长期项目、产品想法和系统设计拆解。</p><p>不放纯通用知识；通用知识沉淀到 <code>topics/</code>。不放外部资料原文；原文资料放 <code>reference/</code>。</p><h2 id="当前项目" tabindex="-1">当前项目 <a class="header-anchor" href="#当前项目" aria-label="Permalink to &quot;当前项目&quot;">​</a></h2><ul><li><a href="./hermes/README">Hermes</a>：Hermes、Kanban、多 Agent、worker 和架构阅读。</li></ul></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("projects/README.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const README = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  README as default
};
