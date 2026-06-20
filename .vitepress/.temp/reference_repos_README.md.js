import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Repos","description":"","frontmatter":{},"headers":[],"relativePath":"reference/repos/README.md","filePath":"reference/repos/README.md"}');
const _sfc_main = { name: "reference/repos/README.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="repos" tabindex="-1">Repos <a class="header-anchor" href="#repos" aria-label="Permalink to &quot;Repos&quot;">​</a></h1><p>这里放外部仓库的下载副本或原文资料。</p><p>不在这里写自己的长总结；阅读笔记应放到 <code>topics/</code> 或 <code>projects/</code>。</p><h2 id="当前资料" tabindex="-1">当前资料 <a class="header-anchor" href="#当前资料" aria-label="Permalink to &quot;当前资料&quot;">​</a></h2><ul><li><code>vibe-coding-cn/</code>：AI coding / vibe coding 外部参考项目。</li></ul><p>这个目录当前不纳入 MkDocs 站点正文，避免外部仓库的大量文件影响阅读导航。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("reference/repos/README.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const README = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  README as default
};
