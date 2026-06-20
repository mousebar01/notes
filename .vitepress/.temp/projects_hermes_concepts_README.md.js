import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Concepts","description":"","frontmatter":{},"headers":[],"relativePath":"projects/hermes/concepts/README.md","filePath":"projects/hermes/concepts/README.md"}');
const _sfc_main = { name: "projects/hermes/concepts/README.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="concepts" tabindex="-1">Concepts <a class="header-anchor" href="#concepts" aria-label="Permalink to &quot;Concepts&quot;">​</a></h1><p>这里放 Hermes / Agent 相关的概念辨析笔记。</p><h2 id="当前笔记" tabindex="-1">当前笔记 <a class="header-anchor" href="#当前笔记" aria-label="Permalink to &quot;当前笔记&quot;">​</a></h2><ul><li><a href="./Agent Swarm 协作方式">Agent Swarm 协作方式</a>：解释 Swarm 范式，并对比 Hermes Kanban 的持久化协作方式。</li></ul></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("projects/hermes/concepts/README.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const README = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  README as default
};
