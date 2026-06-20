import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Agent Session 字段","description":"","frontmatter":{},"headers":[],"relativePath":"topics/agent/Agent Session 字段.md","filePath":"topics/agent/Agent Session 字段.md"}');
const _sfc_main = { name: "topics/agent/Agent Session 字段.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="agent-session-字段" tabindex="-1">Agent Session 字段 <a class="header-anchor" href="#agent-session-字段" aria-label="Permalink to &quot;Agent Session 字段&quot;">​</a></h1><p>Agent 的 session 不是单纯保存一段聊天记录，而是把一次持续交互拆成几个层次来管理。</p><p>我现在可以先把它理解成三块：</p><h2 id="会话元信息" tabindex="-1">会话元信息 <a class="header-anchor" href="#会话元信息" aria-label="Permalink to &quot;会话元信息&quot;">​</a></h2><p>第一块是 session 自己的元信息，例如：</p><ul><li><code>session_id</code></li><li>标题</li><li>创建时间</li><li>最近活跃时间</li><li>消息数</li></ul><p>这部分解决的是“这个会话是谁、什么时候开始、现在处于什么状态”的问题。</p><h2 id="事件日志" tabindex="-1">事件日志 <a class="header-anchor" href="#事件日志" aria-label="Permalink to &quot;事件日志&quot;">​</a></h2><p>第二块是 append-only 的事件日志。</p><p>每一轮交互都会继续追加事件，而不是随便覆盖旧内容。这里通常会记录：</p><ul><li>用户消息</li><li>助手回复</li><li>工具调用</li><li>工具结果</li></ul><p>append-only 的好处是可以回放、审计和恢复。即使中途出错，也能知道前面发生过什么。</p><h2 id="state" tabindex="-1">State <a class="header-anchor" href="#state" aria-label="Permalink to &quot;State&quot;">​</a></h2><p>第三块是 <code>state</code>。</p><p><code>state</code> 不是逐字保存所有历史，而是保存压缩后的当前状态，比如 summary、当前任务、关键上下文、未完成事项等。</p><p>可以粗略理解为：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>events 负责保留过程</span></span>
<span class="line"><span>state 负责保留当前可继续工作的状态</span></span></code></pre></div><p>这也是 Agent 能跨轮继续工作的关键：它不一定每次都读取完整历史，但需要有一个压缩后的状态，让下一轮知道现在该从哪里继续。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("topics/agent/Agent Session 字段.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const Agent_Session___ = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  Agent_Session___ as default
};
