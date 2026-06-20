import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"","description":"","frontmatter":{},"headers":[],"relativePath":"projects/hermes/concepts/Agent Swarm 协作方式.md","filePath":"projects/hermes/concepts/Agent Swarm 协作方式.md"}');
const _sfc_main = { name: "projects/hermes/concepts/Agent Swarm 协作方式.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><p><strong>Swarm</strong> 可以理解成一种“群体协作式 agent 范式”。</p><p>简单说：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>多个 agent 像一个小队/蜂群一样，被同时拉起来，</span></span>
<span class="line"><span>它们围绕同一个目标互相协作、分工、通信，最后产出结果。</span></span></code></pre></div><p>它的典型形态是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Team Lead / Manager Agent</span></span>
<span class="line"><span>        ↓</span></span>
<span class="line"><span>  子 agent A</span></span>
<span class="line"><span>  子 agent B</span></span>
<span class="line"><span>  子 agent C</span></span>
<span class="line"><span>        ↓</span></span>
<span class="line"><span> 汇总结果</span></span></code></pre></div><p>比如用户说：</p><blockquote><p>帮我做一个市场调研。</p></blockquote><p>swarm 范式会是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Manager agent 负责拆任务</span></span>
<span class="line"><span>Research agent 查资料</span></span>
<span class="line"><span>Analysis agent 做分析</span></span>
<span class="line"><span>Writer agent 写报告</span></span>
<span class="line"><span>Reviewer agent 检查</span></span></code></pre></div><p>这些 agent 可能在同一个运行时里互相发消息、共享上下文，或者由一个主 agent 临时创建和管理。</p><p>它的核心特征是：</p><table tabindex="0"><thead><tr><th>特征</th><th>Swarm 范式</th></tr></thead><tbody><tr><td>协作方式</td><td>agent 之间直接或半直接协作</td></tr><tr><td>生命周期</td><td>通常围绕一次任务临时创建</td></tr><tr><td>控制者</td><td>manager / lead agent</td></tr><tr><td>状态位置</td><td>多在对话上下文或运行时内部</td></tr><tr><td>优点</td><td>灵活、像团队讨论、容易做动态分工</td></tr><tr><td>缺点</td><td>容易失控、状态不持久、失败恢复差、生命周期脆弱</td></tr></tbody></table><p>和 Hermes Kanban 对比：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Swarm：agent 像在一个会议室里互相说话。</span></span>
<span class="line"><span>Kanban：agent 不直接说话，都去任务板上领活和交活。</span></span></code></pre></div><p>更直白地说：</p><p><strong>Swarm 是“多 agent 临时组队一起干”。 Kanban 是“多 agent 围绕持久任务系统异步协作”。</strong></p><p>论文里反对的主要不是“多个 agent 协作”本身，而是反对那种 <strong>in-process swarm</strong>：很多子 agent 被塞在同一个 SDK/runtime 生命周期里，一旦主 agent 结束、容器重启、上下文断掉，子 agent 可能也跟着消失。</p><p>Swarm 协作通常是由一个父 agent / leader agent 临时拉起多个子 agent 分工执行，子 agent 把结果交回父 agent；问题是整个协作生命周期依赖父 agent 所在的运行时和上下文，一旦父 agent 结束、容器重启或上下文断裂，子 agent 群体就容易被中断或丢失状态。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("projects/hermes/concepts/Agent Swarm 协作方式.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const Agent_Swarm_____ = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  Agent_Swarm_____ as default
};
