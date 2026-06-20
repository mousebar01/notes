import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Learning","description":"","frontmatter":{},"headers":[],"relativePath":"topics/learning/README.md","filePath":"topics/learning/README.md"}');
const _sfc_main = { name: "topics/learning/README.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="learning" tabindex="-1">Learning <a class="header-anchor" href="#learning" aria-label="Permalink to &quot;Learning&quot;">​</a></h1><p>这里整理学习方法、知识管理、记录复盘和主动输出相关笔记。</p><p>重点不是收集学习技巧，而是沉淀自己真正用得上的学习判断：</p><ul><li>如何抓主线</li><li>如何区分需要内化和可以查询的知识</li><li>如何通过行动验证理解</li><li>如何把记录变成主动输出</li><li>如何把零散信息压缩成可复用的认知结构</li></ul><h2 id="笔记" tabindex="-1">笔记 <a class="header-anchor" href="#笔记" aria-label="Permalink to &quot;笔记&quot;">​</a></h2><ul><li><a href="./快速学习">快速学习不是多看资料，而是更快地形成判断</a></li><li><a href="./主动输出的能力">记录不是保存信息，而是在训练主动输出</a></li></ul></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("topics/learning/README.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const README = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  README as default
};
