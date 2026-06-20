import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Software Engineering","description":"","frontmatter":{},"headers":[],"relativePath":"topics/software-engineering/README.md","filePath":"topics/software-engineering/README.md"}');
const _sfc_main = { name: "topics/software-engineering/README.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="software-engineering" tabindex="-1">Software Engineering <a class="header-anchor" href="#software-engineering" aria-label="Permalink to &quot;Software Engineering&quot;">​</a></h1><p>这里记录软件工程、架构边界、工程设计、日志和排查经验。</p><p>不放 AI 工具使用心得；这类内容放到 <a href="./../ai-coding/README">AI Coding</a>。不放具体项目拆解；项目内容放到 <code>projects/</code>。</p><h2 id="当前笔记" tabindex="-1">当前笔记 <a class="header-anchor" href="#当前笔记" aria-label="Permalink to &quot;当前笔记&quot;">​</a></h2><ul><li><a href="./软件工程">软件工程的一些初步理解</a>：软件熵、耦合性、单一职责，以及 AI coding 视角下的软件工程能力。</li><li><a href="./工程程序设计经验总结">工程程序设计经验总结</a>：从 Agent 代码阅读中总结出的职责、变化、耦合、测试和边界。</li><li><a href="./日志细节">日志细节</a>：MCP server / subprocess 日志为什么不应直接打到终端。</li></ul></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("topics/software-engineering/README.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const README = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  README as default
};
