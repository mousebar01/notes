import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Notes","description":"","frontmatter":{},"headers":[],"relativePath":"README.md","filePath":"README.md"}');
const _sfc_main = { name: "README.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="notes" tabindex="-1">Notes <a class="header-anchor" href="#notes" aria-label="Permalink to &quot;Notes&quot;">​</a></h1><p>这是我的个人长期笔记库，用来保存学习笔记、项目拆解、外部资料和阶段复盘。</p><h2 id="目录结构" tabindex="-1">目录结构 <a class="header-anchor" href="#目录结构" aria-label="Permalink to &quot;目录结构&quot;">​</a></h2><ul><li><code>index/</code>：人看的索引入口。</li><li><code>topics/</code>：通用知识笔记。</li><li><code>projects/</code>：长期项目、产品和系统设计。</li><li><code>reference/</code>：外部资料原文。</li><li><code>inbox/</code>：临时输入和未归类想法。</li><li><code>reviews/</code>：阶段复盘。</li><li><code>archive/</code>：旧内容归档。</li></ul><h2 id="整理原则" tabindex="-1">整理原则 <a class="header-anchor" href="#整理原则" aria-label="Permalink to &quot;整理原则&quot;">​</a></h2><ul><li>保留原意，不要擅自改写成标准教材口吻。</li><li>不要为了分类而分类。</li><li>外部资料放 <code>reference/</code>。</li><li>项目推进放 <code>projects/</code>。</li><li>通用知识沉淀放 <code>topics/</code>。</li><li>临时想法先放 <code>inbox/</code>。</li></ul></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("README.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const README = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  README as default
};
