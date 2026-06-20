import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Agent 系统学习索引","description":"","frontmatter":{},"headers":[],"relativePath":"index/Agent 系统学习索引.md","filePath":"index/Agent 系统学习索引.md"}');
const _sfc_main = { name: "index/Agent 系统学习索引.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="agent-系统学习索引" tabindex="-1">Agent 系统学习索引 <a class="header-anchor" href="#agent-系统学习索引" aria-label="Permalink to &quot;Agent 系统学习索引&quot;">​</a></h1><p>这个索引用来把当前仓库里和 Agent 系统相关的笔记串起来，避免内容散在多个目录里找不到。</p><h2 id="总体主线" tabindex="-1">总体主线 <a class="header-anchor" href="#总体主线" aria-label="Permalink to &quot;总体主线&quot;">​</a></h2><p>目前可以按这条路径看：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>工程设计基础</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>Agent 单轮上下文</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>HTTP payload / messages / tools</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>记忆系统设计</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>工具安全与沙箱</span></span>
<span class="line"><span>  ↓</span></span>
<span class="line"><span>长期项目：Hermes</span></span></code></pre></div><h2 id="_1-工程设计基础" tabindex="-1">1. 工程设计基础 <a class="header-anchor" href="#_1-工程设计基础" aria-label="Permalink to &quot;1. 工程设计基础&quot;">​</a></h2><p>相关笔记：</p><ul><li><a href="./../topics/software-engineering/工程程序设计经验总结">工程程序设计经验总结</a></li><li><a href="./../topics/software-engineering/软件工程">软件工程的一些初步理解</a></li></ul><p>关键词：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>职责边界</span></span>
<span class="line"><span>变化成本</span></span>
<span class="line"><span>低耦合</span></span>
<span class="line"><span>可测试性</span></span>
<span class="line"><span>异常边界</span></span>
<span class="line"><span>工程不是只写 happy path</span></span></code></pre></div><h2 id="_2-上下文管理" tabindex="-1">2. 上下文管理 <a class="header-anchor" href="#_2-上下文管理" aria-label="Permalink to &quot;2. 上下文管理&quot;">​</a></h2><p>相关笔记：</p><ul><li><a href="./../topics/agent/上下文管理">Agent 上下文管理</a></li><li><a href="./../topics/llm/DeepSeek HTTP payload 结构">DeepSeek HTTP payload 结构</a></li></ul><p>关键词：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>单次对话流程</span></span>
<span class="line"><span>runtime context</span></span>
<span class="line"><span>messages</span></span>
<span class="line"><span>tools schema</span></span>
<span class="line"><span>tool_choice</span></span>
<span class="line"><span>ReAct loop</span></span>
<span class="line"><span>工具结果回填</span></span></code></pre></div><h2 id="_3-记忆系统" tabindex="-1">3. 记忆系统 <a class="header-anchor" href="#_3-记忆系统" aria-label="Permalink to &quot;3. 记忆系统&quot;">​</a></h2><p>相关入口：</p><ul><li><a href="./../topics/algorithms/clustering/README">聚类算法笔记</a></li></ul><p>关键词：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>长期记忆</span></span>
<span class="line"><span>BM25</span></span>
<span class="line"><span>embedding</span></span>
<span class="line"><span>RRF</span></span>
<span class="line"><span>向量检索</span></span>
<span class="line"><span>图记忆</span></span>
<span class="line"><span>记忆衰减</span></span>
<span class="line"><span>episode / note / user memory / agent memory</span></span></code></pre></div><p>这里目前主要保留相关算法笔记，后续如果继续整理记忆系统，可以沉淀到 <code>topics/agent/</code> 或新的专题目录。</p><h2 id="_4-安全与沙箱" tabindex="-1">4. 安全与沙箱 <a class="header-anchor" href="#_4-安全与沙箱" aria-label="Permalink to &quot;4. 安全与沙箱&quot;">​</a></h2><p>相关笔记：</p><ul><li><a href="./../topics/agent/security/README">Agent 安全与沙箱</a></li><li><a href="./../topics/agent/security/提示词攻击测试方案">提示词攻击测试方案</a></li><li><a href="./../topics/agent/security/Agent 提示词攻击测试流程">Agent 提示词攻击测试流程</a></li><li><a href="./../topics/agent/security/AstrBot-Agent-沙箱调研">AstrBot Agent 沙箱调研</a></li></ul><p>关键词：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>提示词攻击</span></span>
<span class="line"><span>间接注入</span></span>
<span class="line"><span>工具权限</span></span>
<span class="line"><span>不可信内容边界</span></span>
<span class="line"><span>FakeProvider</span></span>
<span class="line"><span>沙箱</span></span>
<span class="line"><span>文件系统白名单</span></span>
<span class="line"><span>命令权限</span></span></code></pre></div><p>核心判断：</p><blockquote><p>Agent 安全不能只靠模型拒绝，必须让工具调度层、权限系统和沙箱兜底。</p></blockquote><h2 id="_5-hermes-项目" tabindex="-1">5. Hermes 项目 <a class="header-anchor" href="#_5-hermes-项目" aria-label="Permalink to &quot;5. Hermes 项目&quot;">​</a></h2><p>相关入口：</p><ul><li><a href="./../projects/hermes/README">Hermes</a></li><li><a href="./../projects/hermes/kanban/多agent协作">Hermes Kanban - 多 agent 协作</a></li></ul><p>关键词：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>Kanban</span></span>
<span class="line"><span>多 Agent</span></span>
<span class="line"><span>worker</span></span>
<span class="line"><span>heartbeat</span></span>
<span class="line"><span>TTL</span></span>
<span class="line"><span>lease</span></span>
<span class="line"><span>dispatcher</span></span>
<span class="line"><span>ACP</span></span></code></pre></div></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("index/Agent 系统学习索引.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const Agent_______ = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  Agent_______ as default
};
