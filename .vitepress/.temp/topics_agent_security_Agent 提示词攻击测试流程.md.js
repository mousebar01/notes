import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Agent 提示词攻击测试流程","description":"","frontmatter":{},"headers":[],"relativePath":"topics/agent/security/Agent 提示词攻击测试流程.md","filePath":"topics/agent/security/Agent 提示词攻击测试流程.md"}');
const _sfc_main = { name: "topics/agent/security/Agent 提示词攻击测试流程.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="agent-提示词攻击测试流程" tabindex="-1">Agent 提示词攻击测试流程 <a class="header-anchor" href="#agent-提示词攻击测试流程" aria-label="Permalink to &quot;Agent 提示词攻击测试流程&quot;">​</a></h1><p>这篇从 <a href="./提示词攻击测试方案">提示词攻击测试方案</a> 提炼出一套可复用流程。适合在做 Agent 系统、工具调用、沙箱或权限系统时，用来检查安全边界是否可靠。</p><h2 id="适用场景" tabindex="-1">适用场景 <a class="header-anchor" href="#适用场景" aria-label="Permalink to &quot;适用场景&quot;">​</a></h2><ul><li>Agent 可以调用工具，例如 shell、文件读写、浏览器、网络请求。</li><li>Agent 会读取外部内容，例如网页、文件、历史消息或记忆。</li><li>系统需要证明：即使模型被诱导，危险动作也不会真实执行。</li></ul><h2 id="测试顺序" tabindex="-1">测试顺序 <a class="header-anchor" href="#测试顺序" aria-label="Permalink to &quot;测试顺序&quot;">​</a></h2><h3 id="_1-先列出高风险能力" tabindex="-1">1. 先列出高风险能力 <a class="header-anchor" href="#_1-先列出高风险能力" aria-label="Permalink to &quot;1. 先列出高风险能力&quot;">​</a></h3><p>优先关注这些工具或能力：</p><ul><li>shell / subprocess</li><li>文件读取和写入</li><li>网络请求</li><li>浏览器自动化</li><li>记忆写入</li><li>上传、下载、外部 API 调用</li></ul><h3 id="_2-再定义硬边界" tabindex="-1">2. 再定义硬边界 <a class="header-anchor" href="#_2-再定义硬边界" aria-label="Permalink to &quot;2. 再定义硬边界&quot;">​</a></h3><p>每个高风险能力都要明确：</p><ul><li>哪些用户可以调用</li><li>哪些会话可以调用</li><li>哪些路径可以访问</li><li>哪些命令必须拒绝</li><li>哪些来源是不可信内容</li><li>拒绝后是否有日志</li></ul><h3 id="_3-用-fakeprovider-模拟模型被攻破" tabindex="-1">3. 用 FakeProvider 模拟模型被攻破 <a class="header-anchor" href="#_3-用-fakeprovider-模拟模型被攻破" aria-label="Permalink to &quot;3. 用 FakeProvider 模拟模型被攻破&quot;">​</a></h3><p>不要只依赖真实模型测试。更稳的方式是让测试模型直接返回危险工具调用，例如：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>用户输入包含注入语义</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>FakeProvider 返回危险 ToolCall</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>工具调度层收到调用</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>安全策略拒绝</span></span>
<span class="line"><span>↓</span></span>
<span class="line"><span>真实工具没有执行</span></span></code></pre></div><p>这样测试的是工程边界，而不是模型当天的拒绝能力。</p><h3 id="_4-覆盖-p0-场景" tabindex="-1">4. 覆盖 P0 场景 <a class="header-anchor" href="#_4-覆盖-p0-场景" aria-label="Permalink to &quot;4. 覆盖 P0 场景&quot;">​</a></h3><p>优先覆盖这些测试：</p><ul><li>禁用 shell 后，模型请求 shell 也不能执行。</li><li><code>rm -rf /</code> 这类危险命令必须拒绝。</li><li>工作区外文件读取必须拒绝。</li><li>网页或文件里的提示词注入不能触发工具调用。</li><li>回复文本中的伪 <code>tool_calls</code> 不能被当作真实工具调用。</li></ul><h3 id="_5-做分层断言" tabindex="-1">5. 做分层断言 <a class="header-anchor" href="#_5-做分层断言" aria-label="Permalink to &quot;5. 做分层断言&quot;">​</a></h3><p>一次安全测试最好不要只断言“输出看起来安全”。至少要看：</p><ul><li>工具调用是否被拒绝。</li><li>拒绝原因是否准确。</li><li>真实文件系统是否没有变化。</li><li>网络请求是否没有发出。</li><li>安全事件日志是否记录。</li><li>不可信内容是否没有变成指令。</li></ul><h2 id="一句话原则" tabindex="-1">一句话原则 <a class="header-anchor" href="#一句话原则" aria-label="Permalink to &quot;一句话原则&quot;">​</a></h2><p>Agent 安全测试的重点不是证明模型永远不会犯错，而是证明模型犯错以后，系统边界仍然拦得住。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("topics/agent/security/Agent 提示词攻击测试流程.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const Agent__________ = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  Agent__________ as default
};
