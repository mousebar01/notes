import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Algorithms","description":"","frontmatter":{},"headers":[],"relativePath":"topics/algorithms/README.md","filePath":"topics/algorithms/README.md"}');
const _sfc_main = { name: "topics/algorithms/README.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="algorithms" tabindex="-1">Algorithms <a class="header-anchor" href="#algorithms" aria-label="Permalink to &quot;Algorithms&quot;">​</a></h1><p>这里放算法学习和算法工程实现笔记。</p><p>不放具体项目日报，也不放外部论文原文；论文原文应放 <code>reference/papers/</code>，这里保留自己的理解、方案和复盘。</p><h2 id="当前主题" tabindex="-1">当前主题 <a class="header-anchor" href="#当前主题" aria-label="Permalink to &quot;当前主题&quot;">​</a></h2><ul><li><a href="./clustering/README">聚类算法</a>：聚类算法、增量聚类改造和工程实现。</li></ul></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("topics/algorithms/README.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const README = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  README as default
};
