import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"笔记总索引","description":"","frontmatter":{},"headers":[],"relativePath":"index/README.md","filePath":"index/README.md"}');
const _sfc_main = { name: "index/README.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="笔记总索引" tabindex="-1">笔记总索引 <a class="header-anchor" href="#笔记总索引" aria-label="Permalink to &quot;笔记总索引&quot;">​</a></h1><p>这里是整个笔记库的人用入口。它的作用是帮我快速找到主题、项目、资料和复盘，不追求一次性整理完所有内容。</p><h2 id="目录入口" tabindex="-1">目录入口 <a class="header-anchor" href="#目录入口" aria-label="Permalink to &quot;目录入口&quot;">​</a></h2><ul><li><a href="./../topics/README">topics</a>：通用知识笔记。</li><li><a href="./../projects/README">projects</a>：长期项目、产品和系统设计。</li><li><a href="./../reference/README">reference</a>：外部资料原文。</li><li><a href="./../inbox/README">inbox</a>：临时记录和未归类想法。</li><li><a href="./../reviews/README">reviews</a>：阶段复盘。</li><li><a href="./../archive/README">archive</a>：旧内容归档。</li></ul><h2 id="当前专题" tabindex="-1">当前专题 <a class="header-anchor" href="#当前专题" aria-label="Permalink to &quot;当前专题&quot;">​</a></h2><h3 id="agent-llm" tabindex="-1">Agent / LLM <a class="header-anchor" href="#agent-llm" aria-label="Permalink to &quot;Agent / LLM&quot;">​</a></h3><ul><li><a href="./../topics/agent/README">Agent</a></li><li><a href="./../topics/agent/上下文管理">Agent 上下文管理</a></li><li><a href="./../topics/agent/security/README">Agent 安全与沙箱</a></li><li><a href="./../topics/agent/security/提示词攻击测试方案">提示词攻击测试方案</a></li><li><a href="./../topics/agent/security/Agent 提示词攻击测试流程">Agent 提示词攻击测试流程</a></li><li><a href="./../topics/llm/README">LLM</a></li><li><a href="./../topics/llm/DeepSeek HTTP payload 结构">DeepSeek HTTP payload 结构</a></li><li><a href="./../topics/llm/QLoRA/README">QLoRA 学习资料</a></li></ul><h3 id="ai-coding-软件工程" tabindex="-1">AI Coding / 软件工程 <a class="header-anchor" href="#ai-coding-软件工程" aria-label="Permalink to &quot;AI Coding / 软件工程&quot;">​</a></h3><ul><li><a href="./../topics/ai-coding/README">AI Coding</a></li><li><a href="./../topics/ai-coding/AI">AI Coding 的一些初步感想</a></li><li><a href="./../topics/ai-coding/渐进式披露">上下文压缩作为渐进式披露机制</a></li><li><a href="./../topics/software-engineering/README">Software Engineering</a></li><li><a href="./../topics/software-engineering/软件工程">软件工程的一些初步理解</a></li><li><a href="./../topics/software-engineering/工程程序设计经验总结">工程程序设计经验总结</a></li></ul><h3 id="算法" tabindex="-1">算法 <a class="header-anchor" href="#算法" aria-label="Permalink to &quot;算法&quot;">​</a></h3><ul><li><a href="./../topics/algorithms/clustering/README">聚类算法笔记</a></li></ul><h3 id="项目" tabindex="-1">项目 <a class="header-anchor" href="#项目" aria-label="Permalink to &quot;项目&quot;">​</a></h3><ul><li><a href="./../projects/hermes/README">Hermes</a></li><li><a href="./../projects/hermes/kanban/多agent协作">Hermes Kanban - 多 agent 协作</a></li></ul><h3 id="外部资料" tabindex="-1">外部资料 <a class="header-anchor" href="#外部资料" aria-label="Permalink to &quot;外部资料&quot;">​</a></h3><ul><li><a href="./../reference/repos/vibe-coding-cn/README">vibe-coding-cn</a></li></ul></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("index/README.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const README = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  README as default
};
