import { ssrRenderAttrs, ssrRenderStyle } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"DeepSeek HTTP payload 结构","description":"","frontmatter":{},"headers":[],"relativePath":"topics/llm/DeepSeek HTTP payload 结构.md","filePath":"topics/llm/DeepSeek HTTP payload 结构.md"}');
const _sfc_main = { name: "topics/llm/DeepSeek HTTP payload 结构.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="deepseek-http-payload-结构" tabindex="-1">DeepSeek HTTP payload 结构 <a class="header-anchor" href="#deepseek-http-payload-结构" aria-label="Permalink to &quot;DeepSeek HTTP payload 结构&quot;">​</a></h1><p>这条笔记记录一次 DeepSeek / OpenAI 风格模型调用里，<code>messages</code>、<code>tools</code> 和控制字段分别承担什么职责，以及当前结构里工具信息重复的问题。</p><h2 id="当前结构" tabindex="-1">当前结构 <a class="header-anchor" href="#当前结构" aria-label="Permalink to &quot;当前结构&quot;">​</a></h2><p>这轮对话现在的最终结构大概是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>DeepSeek HTTP payload</span></span>
<span class="line"><span>├─ model</span></span>
<span class="line"><span>├─ messages</span></span>
<span class="line"><span>│  ├─ system: 固定系统提示词</span></span>
<span class="line"><span>│  ├─ system: 动态 runtime context</span></span>
<span class="line"><span>│  │  ├─ runtime instructions</span></span>
<span class="line"><span>│  │  ├─ retrieved_memory</span></span>
<span class="line"><span>│  │  └─ available_tools 的文本说明</span></span>
<span class="line"><span>│  └─ user: 当前用户输入</span></span>
<span class="line"><span>├─ temperature</span></span>
<span class="line"><span>├─ tools</span></span>
<span class="line"><span>│  ├─ memorize function schema</span></span>
<span class="line"><span>│  ├─ recall_memory function schema</span></span>
<span class="line"><span>│  ├─ calculator function schema</span></span>
<span class="line"><span>│  └─ web_search function schema</span></span>
<span class="line"><span>├─ tool_choice: auto</span></span>
<span class="line"><span>└─ enable_thinking</span></span></code></pre></div><p>换成人话说，现在一次模型调用分成三块。</p><h2 id="_1-messages-给模型读的上下文" tabindex="-1">1. messages：给模型读的上下文 <a class="header-anchor" href="#_1-messages-给模型读的上下文" aria-label="Permalink to &quot;1. messages：给模型读的上下文&quot;">​</a></h2><p><code>messages</code> 是模型真正会阅读的上下文文本。</p><p>这里面通常包括：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>固定 system prompt</span></span>
<span class="line"><span>动态上下文说明</span></span>
<span class="line"><span>当前用户输入</span></span>
<span class="line"><span>历史对话</span></span>
<span class="line"><span>本轮 ReAct 工具结果</span></span></code></pre></div><p>现在看到的大概是：</p><div class="language-json vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">json</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">{</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#005CC5", "--shiki-dark": "#79B8FF" })}">  &quot;messages&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">: [</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">    {</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#005CC5", "--shiki-dark": "#79B8FF" })}">      &quot;role&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">: </span><span style="${ssrRenderStyle({ "--shiki-light": "#032F62", "--shiki-dark": "#9ECBFF" })}">&quot;system&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">,</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#005CC5", "--shiki-dark": "#79B8FF" })}">      &quot;content&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">: </span><span style="${ssrRenderStyle({ "--shiki-light": "#032F62", "--shiki-dark": "#9ECBFF" })}">&quot;固定中文助手设定...&quot;</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">    },</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">    {</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#005CC5", "--shiki-dark": "#79B8FF" })}">      &quot;role&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">: </span><span style="${ssrRenderStyle({ "--shiki-light": "#032F62", "--shiki-dark": "#9ECBFF" })}">&quot;system&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">,</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#005CC5", "--shiki-dark": "#79B8FF" })}">      &quot;content&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">: </span><span style="${ssrRenderStyle({ "--shiki-light": "#032F62", "--shiki-dark": "#9ECBFF" })}">&quot;runtime context + memory block + available tools 文本说明&quot;</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">    },</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">    {</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#005CC5", "--shiki-dark": "#79B8FF" })}">      &quot;role&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">: </span><span style="${ssrRenderStyle({ "--shiki-light": "#032F62", "--shiki-dark": "#9ECBFF" })}">&quot;user&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">,</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#005CC5", "--shiki-dark": "#79B8FF" })}">      &quot;content&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">: </span><span style="${ssrRenderStyle({ "--shiki-light": "#032F62", "--shiki-dark": "#9ECBFF" })}">&quot;用户当前输入&quot;</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">    }</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">  ]</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">}</span></span></code></pre></div><p>这部分的重点是：</p><blockquote><p><code>messages</code> 负责提供模型需要理解的语境、约束、记忆、历史和用户请求。</p></blockquote><h2 id="_2-tools-api-原生工具定义" tabindex="-1">2. tools：API 原生工具定义 <a class="header-anchor" href="#_2-tools-api-原生工具定义" aria-label="Permalink to &quot;2. tools：API 原生工具定义&quot;">​</a></h2><p><code>tools</code> 不是普通 prompt 文本，而是 DeepSeek / OpenAI function calling 协议要求的工具 schema。</p><p>示例：</p><div class="language-json vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">json</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">{</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#005CC5", "--shiki-dark": "#79B8FF" })}">  &quot;tools&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">: [</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">    {</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#005CC5", "--shiki-dark": "#79B8FF" })}">      &quot;type&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">: </span><span style="${ssrRenderStyle({ "--shiki-light": "#032F62", "--shiki-dark": "#9ECBFF" })}">&quot;function&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">,</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#005CC5", "--shiki-dark": "#79B8FF" })}">      &quot;function&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">: {</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#005CC5", "--shiki-dark": "#79B8FF" })}">        &quot;name&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">: </span><span style="${ssrRenderStyle({ "--shiki-light": "#032F62", "--shiki-dark": "#9ECBFF" })}">&quot;calculator&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">,</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#005CC5", "--shiki-dark": "#79B8FF" })}">        &quot;description&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">: </span><span style="${ssrRenderStyle({ "--shiki-light": "#032F62", "--shiki-dark": "#9ECBFF" })}">&quot;...&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">,</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#005CC5", "--shiki-dark": "#79B8FF" })}">        &quot;parameters&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">: {}</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">      }</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">    }</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">  ]</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">}</span></span></code></pre></div><p>它的作用是告诉模型：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>有哪些工具可以调用</span></span>
<span class="line"><span>每个工具叫什么名字</span></span>
<span class="line"><span>每个工具的用途是什么</span></span>
<span class="line"><span>参数长什么样</span></span>
<span class="line"><span>哪些参数必填</span></span></code></pre></div><p>这部分属于 API 原生协议层，而不是 prompt 文本层。</p><h2 id="_3-控制字段" tabindex="-1">3. 控制字段 <a class="header-anchor" href="#_3-控制字段" aria-label="Permalink to &quot;3. 控制字段&quot;">​</a></h2><p>控制字段负责设置模型、采样、工具调用策略和思考模式。</p><p>例如：</p><div class="language-json vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">json</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">{</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#005CC5", "--shiki-dark": "#79B8FF" })}">  &quot;model&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">: </span><span style="${ssrRenderStyle({ "--shiki-light": "#032F62", "--shiki-dark": "#9ECBFF" })}">&quot;deepseek-v4-flash&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">,</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#005CC5", "--shiki-dark": "#79B8FF" })}">  &quot;temperature&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">: </span><span style="${ssrRenderStyle({ "--shiki-light": "#005CC5", "--shiki-dark": "#79B8FF" })}">0.2</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">,</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#005CC5", "--shiki-dark": "#79B8FF" })}">  &quot;tool_choice&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">: </span><span style="${ssrRenderStyle({ "--shiki-light": "#032F62", "--shiki-dark": "#9ECBFF" })}">&quot;auto&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">,</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#005CC5", "--shiki-dark": "#79B8FF" })}">  &quot;enable_thinking&quot;</span><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">: </span><span style="${ssrRenderStyle({ "--shiki-light": "#005CC5", "--shiki-dark": "#79B8FF" })}">true</span></span>
<span class="line"><span style="${ssrRenderStyle({ "--shiki-light": "#24292E", "--shiki-dark": "#E1E4E8" })}">}</span></span></code></pre></div><p>这些字段不属于 <code>messages</code>，但会影响这次调用的行为。</p><h2 id="当前问题-工具信息重复" tabindex="-1">当前问题：工具信息重复 <a class="header-anchor" href="#当前问题-工具信息重复" aria-label="Permalink to &quot;当前问题：工具信息重复&quot;">​</a></h2><p>现在的问题点很清楚：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>available_tools 在 messages 里出现了一次</span></span>
<span class="line"><span>tools schema 在 payload.tools 里又出现了一次</span></span></code></pre></div><p>也就是说，工具信息被放了两遍：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. prompt 文本里：</span></span>
<span class="line"><span>   &lt;available_tools&gt;...&lt;/available_tools&gt;</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. API schema 里：</span></span>
<span class="line"><span>   payload.tools = [...]</span></span></code></pre></div><p>这会带来几个问题：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>1. token 浪费</span></span>
<span class="line"><span>   同一批工具说明重复占用上下文。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>2. 信息不一致风险</span></span>
<span class="line"><span>   如果文本说明和 schema 不同步，模型可能被两套描述干扰。</span></span>
<span class="line"><span></span></span>
<span class="line"><span>3. prompt 噪声变多</span></span>
<span class="line"><span>   messages 里本来应该放上下文和工具使用原则，不应该塞太多 schema 细节。</span></span></code></pre></div><h2 id="更规范的做法" tabindex="-1">更规范的做法 <a class="header-anchor" href="#更规范的做法" aria-label="Permalink to &quot;更规范的做法&quot;">​</a></h2><p>更规范的结构是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>messages 里只保留工具使用原则</span></span>
<span class="line"><span>payload.tools 里放完整工具 schema</span></span></code></pre></div><p>也就是：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>移除 messages 里的 &lt;available_tools&gt; 大块文本说明</span></span>
<span class="line"><span>保留 payload.tools 里的 function schema</span></span></code></pre></div><p><code>messages</code> 里可以保留少量原则，例如：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>如果需要计算、检索记忆或搜索信息，可以调用可用工具。</span></span>
<span class="line"><span>调用工具前先判断是否必要。</span></span>
<span class="line"><span>工具返回结果需要结合用户问题再回答。</span></span>
<span class="line"><span>不要编造工具没有返回的信息。</span></span></code></pre></div><p>但具体工具名称、参数结构、JSON schema 应该主要交给 <code>payload.tools</code>。</p><h2 id="一句话结论" tabindex="-1">一句话结论 <a class="header-anchor" href="#一句话结论" aria-label="Permalink to &quot;一句话结论&quot;">​</a></h2><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>messages 负责语境和原则。</span></span>
<span class="line"><span>tools 负责工具 schema。</span></span>
<span class="line"><span>控制字段负责调用行为。</span></span></code></pre></div><p>当前可以优化的点是：</p><blockquote><p>把 <code>&lt;available_tools&gt;</code> 从 prompt 文本里去掉，让工具定义只保留在 <code>payload.tools</code>，减少重复和干扰。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("topics/llm/DeepSeek HTTP payload 结构.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const DeepSeek_HTTP_payload___ = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  DeepSeek_HTTP_payload___ as default
};
