import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Agent 安全与沙箱","description":"","frontmatter":{},"headers":[],"relativePath":"topics/agent/security/README.md","filePath":"topics/agent/security/README.md"}');
const _sfc_main = { name: "topics/agent/security/README.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="agent-安全与沙箱" tabindex="-1">Agent 安全与沙箱 <a class="header-anchor" href="#agent-安全与沙箱" aria-label="Permalink to &quot;Agent 安全与沙箱&quot;">​</a></h1><p>这篇是 Agent 安全相关笔记的专题入口。当前重点不在“模型是否永远不会被诱导”，而在于：当模型被诱导产生危险意图以后，系统的工具边界、权限边界、不可信内容边界和沙箱边界能不能兜住。</p><h2 id="当前已有笔记" tabindex="-1">当前已有笔记 <a class="header-anchor" href="#当前已有笔记" aria-label="Permalink to &quot;当前已有笔记&quot;">​</a></h2><ul><li><p><a href="./提示词攻击测试方案">提示词攻击测试方案</a></p><ul><li>记录提示词攻击的分类、分层防御思路、高优先级测试用例和自动化测试框架。</li><li>核心观点：Agent 安全测试不能只看模型拒绝，还要验证工具调度层和执行环境是否能拦住危险动作。</li></ul></li><li><p><a href="./AstrBot-Agent-沙箱调研">AstrBot Agent 沙箱调研</a></p><ul><li>记录 AstrBot Agent 沙箱的能力、driver / profile、权限控制和资源限制。</li><li>核心观点：沙箱不是简单的代码执行器，而是 Agent 工具调用和文件操作的隔离执行边界。</li></ul></li></ul><h2 id="目前形成的判断" tabindex="-1">目前形成的判断 <a class="header-anchor" href="#目前形成的判断" aria-label="Permalink to &quot;目前形成的判断&quot;">​</a></h2><p>Agent 安全至少要分三层看：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>模型策略层</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>工具调度层</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>执行环境层</span></span></code></pre></div><p>模型策略层负责尽量减少危险意图，但不能作为最终防线。真正需要重点验证的是后两层：</p><ul><li>工具调度层：当前工具是否允许调用、当前用户是否有权限、参数是否越界、来源是否可信。</li><li>执行环境层：文件系统、网络、shell、资源、超时和工作区边界是否受到限制。</li></ul><p>所以测试时可以故意假设：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>模型已经被诱导成功</span></span></code></pre></div><p>然后看系统是否仍然能把危险动作拦下来。</p><h2 id="后续可继续补" tabindex="-1">后续可继续补 <a class="header-anchor" href="#后续可继续补" aria-label="Permalink to &quot;后续可继续补&quot;">​</a></h2><ul><li>沙箱常见隔离方式：容器、虚拟机、进程级限制、文件系统白名单。</li><li>沙箱到底在保护什么，以及工作区可写、只读、受限模式分别意味着什么。</li><li>哪些文件修改、命令执行、联网操作会触发权限申请或被拒绝。</li><li>Agent 工具权限设计：工具启用、用户权限、来源标记、参数审计。</li><li>不可信内容处理：网页、文件、历史消息、记忆系统如何防止升级为指令。</li><li>自动化安全测试：如何用 FakeProvider 模拟危险工具调用。</li></ul><p>一个可以先记着的判断是：不要把“能跑”误当成“允许跑”。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("topics/agent/security/README.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const README = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  README as default
};
