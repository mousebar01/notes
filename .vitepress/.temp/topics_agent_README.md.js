import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Agent","description":"","frontmatter":{},"headers":[],"relativePath":"topics/agent/README.md","filePath":"topics/agent/README.md"}');
const _sfc_main = { name: "topics/agent/README.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="agent" tabindex="-1">Agent <a class="header-anchor" href="#agent" aria-label="Permalink to &quot;Agent&quot;">​</a></h1><p>这里放 Agent 系统的通用知识，例如上下文管理、安全边界、工具调用和沙箱。</p><p>不放 Hermes 这类具体项目拆解；Hermes 放到 <a href="./../../projects/hermes/README">projects/hermes</a>。不放模型微调和 API 细节；这类内容放到 <a href="./../llm/README">topics/llm</a>。</p><h2 id="当前笔记" tabindex="-1">当前笔记 <a class="header-anchor" href="#当前笔记" aria-label="Permalink to &quot;当前笔记&quot;">​</a></h2><ul><li><a href="./Agent Session 字段">Agent Session 字段</a>：session 元信息、append-only 事件日志和压缩 state 的基本理解。</li><li><a href="./上下文管理">上下文管理</a>：Agent 单轮对话如何组织 messages、tools、runtime context、memory 和压缩策略。</li><li><a href="./security/README">Agent 安全与沙箱</a>：提示词攻击测试、工具权限、沙箱边界和不可信内容处理。</li></ul></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("topics/agent/README.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const README = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  README as default
};
