import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"日志细节：stderr 不直接打到终端","description":"","frontmatter":{},"headers":[],"relativePath":"topics/software-engineering/日志细节.md","filePath":"topics/software-engineering/日志细节.md"}');
const _sfc_main = { name: "topics/software-engineering/日志细节.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="日志细节-stderr-不直接打到终端" tabindex="-1">日志细节：stderr 不直接打到终端 <a class="header-anchor" href="#日志细节-stderr-不直接打到终端" aria-label="Permalink to &quot;日志细节：stderr 不直接打到终端&quot;">​</a></h1><p>很多 MCP server 启动后会输出 banner、日志、warning。</p><p>如果这些东西直接打到 CLI / TUI 的 stderr，会破坏界面渲染。</p><p>所以更稳的做法是：不要让 MCP subprocess 的 stderr 直接污染前台界面，而是写到独立日志文件里。</p><p>这样可以同时满足两个目标：</p><ul><li>前台交互界面保持干净。</li><li>调试时仍然能从日志文件里追踪 server 启动、warning 和错误信息。</li></ul><p>这个细节背后的原则是：</p><blockquote><p>用户界面输出和后台进程日志应该分离。前者服务交互体验，后者服务诊断排查。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("topics/software-engineering/日志细节.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const ____ = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  ____ as default
};
