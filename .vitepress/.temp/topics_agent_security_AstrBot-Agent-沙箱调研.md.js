import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"AstrBot Agent 沙箱调研","description":"","frontmatter":{},"headers":[],"relativePath":"topics/agent/security/AstrBot-Agent-沙箱调研.md","filePath":"topics/agent/security/AstrBot-Agent-沙箱调研.md"}');
const _sfc_main = { name: "topics/agent/security/AstrBot-Agent-沙箱调研.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="astrbot-agent-沙箱调研" tabindex="-1">AstrBot Agent 沙箱调研 <a class="header-anchor" href="#astrbot-agent-沙箱调研" aria-label="Permalink to &quot;AstrBot Agent 沙箱调研&quot;">​</a></h1><p>最近查了一下 AstrBot 里和 Agent 沙箱有关的官方资料，结论是：它已经不是简单的“代码执行器”了，而是一个专门给 Agent 用的隔离执行环境。</p><h2 id="关键信息" tabindex="-1">关键信息 <a class="header-anchor" href="#关键信息" aria-label="Permalink to &quot;关键信息&quot;">​</a></h2><ul><li>AstrBot 从 <code>v4.12.0</code> 起引入了 Agent 沙箱环境，用来替代之前的代码执行器功能。</li><li>这个功能目前还是技术预览，官方也提醒可能有 Bug。</li><li><code>sandbox</code> 模式是在隔离环境里执行动作，不直接跑在 AstrBot 主机上。</li><li>当前支持的驱动主要有： <ul><li><code>Shipyard Neo</code>，官方推荐</li><li><code>Shipyard</code>，旧方案</li><li><code>CUA</code>，适合桌面操作场景</li></ul></li></ul><h2 id="我记下来的重点" tabindex="-1">我记下来的重点 <a class="header-anchor" href="#我记下来的重点" aria-label="Permalink to &quot;我记下来的重点&quot;">​</a></h2><ul><li><code>Shipyard Neo</code> 的工作区根目录固定是 <code>/workspace</code></li><li>文件系统工具通常要传相对路径，不是绝对路径</li><li><code>Shipyard Neo</code> 更适合稳定的 Python / Shell / 文件系统场景</li><li><code>Shipyard Neo</code> 的能力和 profile 有关，只有支持 <code>browser</code> capability 的 profile 才会挂浏览器工具</li><li><code>CUA</code> 更像是电脑使用型沙箱，可以提供 Shell、Python、文件读写、截图、鼠标、键盘等能力</li><li>即使在 sandbox 模式里，AstrBot 的权限控制仍然会影响 Shell、Python、浏览器、上传下载等工具</li><li>每个沙箱环境资源上限大约是 <code>1 CPU + 512 MB</code>，宿主机最好预留更高配置</li><li>sandbox 模式下，AstrBot 会尝试把本地 Skills 同步进沙箱，方便 Agent 在里面执行</li></ul><h2 id="我自己的理解" tabindex="-1">我自己的理解 <a class="header-anchor" href="#我自己的理解" aria-label="Permalink to &quot;我自己的理解&quot;">​</a></h2><p>AstrBot 这里的“沙箱”更像是在给 Agent 一套可控的执行边界：</p><ul><li>让工具调用和文件操作隔离在受控环境里</li><li>让会话级资源复用变得可管理</li><li>让不同能力通过 driver / profile 组合起来</li></ul><p>这和我之前总结的“边界、耦合、测试、变化成本”是对得上的。</p><h2 id="参考资料" tabindex="-1">参考资料 <a class="header-anchor" href="#参考资料" aria-label="Permalink to &quot;参考资料&quot;">​</a></h2><ul><li><a href="https://docs.astrbot.app/use/astrbot-agent-sandbox.html" target="_blank" rel="noreferrer">AstrBot Agent 沙盒环境</a></li><li><a href="https://docs.astrbot.app/en/use/computer.html" target="_blank" rel="noreferrer">AstrBot Computer Use</a></li><li><a href="https://github.com/astrbotdevs/astrbot" target="_blank" rel="noreferrer">AstrBot GitHub</a></li></ul></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("topics/agent/security/AstrBot-Agent-沙箱调研.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const AstrBotAgent_____ = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  AstrBotAgent_____ as default
};
