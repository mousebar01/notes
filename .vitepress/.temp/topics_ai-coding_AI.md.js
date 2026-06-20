import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"AI Coding 的一些初步感想","description":"","frontmatter":{},"headers":[],"relativePath":"topics/ai-coding/AI.md","filePath":"topics/ai-coding/AI.md"}');
const _sfc_main = { name: "topics/ai-coding/AI.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="ai-coding-的一些初步感想" tabindex="-1">AI Coding 的一些初步感想 <a class="header-anchor" href="#ai-coding-的一些初步感想" aria-label="Permalink to &quot;AI Coding 的一些初步感想&quot;">​</a></h1><p>这篇记录主要是在整理我对 AI 编程的初步理解：AI 可以显著提高写代码的效率，但它不是一个能自动理解全部意图的万能助手。真正决定 AI coding 质量的，仍然是使用者自己的判断、表达、上下文组织和验证能力。</p><h2 id="_1-ai-的原理和运行方式" tabindex="-1">1. AI 的原理和运行方式 <a class="header-anchor" href="#_1-ai-的原理和运行方式" aria-label="Permalink to &quot;1. AI 的原理和运行方式&quot;">​</a></h2><p>AI 是基于大量数据和神经网络训练出来的系统，本质上更接近一种概率输出。它可以根据上下文生成看起来合理的代码，但“合理”不一定等于“符合我的真实需求”。</p><p>因此，如果想让 AI 生成的代码更可控、更接近实际目标，就需要学习如何写清楚 prompt，尤其是：</p><ul><li>说明背景和目标</li><li>明确限制条件</li><li>给出期望的修改范围</li><li>描述不希望它做什么</li><li>要求它解释方案或列出改动点</li></ul><p>Prompt 的作用不是“命令 AI 完全听懂”，而是尽量减少信息偏差，让 AI 更接近我真正想要的方向。</p><h2 id="_2-ai-coding-中常见的问题" tabindex="-1">2. AI Coding 中常见的问题 <a class="header-anchor" href="#_2-ai-coding-中常见的问题" aria-label="Permalink to &quot;2. AI Coding 中常见的问题&quot;">​</a></h2><p>现在很多 Agent 已经针对 coding 场景做了优化，但实际使用中仍然会出现一些问题：</p><ol><li>AI 生成的代码和我设想的代码不一样。</li><li>AI 会添油加醋，加入一些我没有要求的设计或功能。</li><li>AI 在修改代码时，有时只是局部打补丁，而不是按我设想的方向重构。</li><li>AI 生成的代码有时我自己也无法完全理解。</li></ol><p>这些问题说明，AI coding 不是简单地“把任务丢给 AI”。如果需求、上下文和修改边界没有对齐，它很容易沿着自己的概率判断往前走。</p><h2 id="_3-ai-在编程中的定位" tabindex="-1">3. AI 在编程中的定位 <a class="header-anchor" href="#_3-ai-在编程中的定位" aria-label="Permalink to &quot;3. AI 在编程中的定位&quot;">​</a></h2><p>我现在更倾向于把 AI 看作一个协作伙伴，而不是一个完全理解我的助手。</p><p>AI 的上限很大程度上由使用者的水平决定。它可以补充执行力、提供思路、生成代码、解释实现，但它不会自动替我建立正确的工程判断，也不会保证所有输出都可靠。</p><p>所以，使用 AI 编程时需要注意：</p><ul><li>AI 可能产生幻觉。</li><li>AI 不一定知道我真正想要什么。</li><li>AI 的输出需要被审查和验证。</li><li>信息对齐比单纯写 prompt 更重要。</li><li>我需要持续扩展自己的工程视野，才能判断 AI 的输出是否合理。</li></ul><p>换句话说，AI 可以放大能力，但前提是我自己要有判断方向的能力。</p><h2 id="_4-一种更稳的使用范式" tabindex="-1">4. 一种更稳的使用范式 <a class="header-anchor" href="#_4-一种更稳的使用范式" aria-label="Permalink to &quot;4. 一种更稳的使用范式&quot;">​</a></h2><p>比较稳的方式是：</p><ol><li>先自己思考方案，直到目标、边界和关键细节都足够清楚。</li><li>再让 AI 执行具体实现。</li><li>让 AI 解释它的改动和理由。</li><li>自己审查代码，确认是否符合预期。</li><li>用测试验证结果。</li></ol><p>测试是最好的检验工具。AI 说自己完成了，不代表真的完成；代码看起来能跑，也不代表符合长期维护的要求。</p><h2 id="_5-和软件工程能力的关系" tabindex="-1">5. 和软件工程能力的关系 <a class="header-anchor" href="#_5-和软件工程能力的关系" aria-label="Permalink to &quot;5. 和软件工程能力的关系&quot;">​</a></h2><p>AI coding 不能只盯着代码细节。真正影响上限的，往往是软件工程能力：是否理解模块边界、耦合性、职责划分、测试和长期维护。</p><p>如果自己没有足够的工程判断，就很难知道 AI 的输出哪里是合理的，哪里只是表面上能跑。</p><p>相关内容可以继续看：<a href="./../software-engineering/软件工程">软件工程</a>。</p><h2 id="小结" tabindex="-1">小结 <a class="header-anchor" href="#小结" aria-label="Permalink to &quot;小结&quot;">​</a></h2><p>AI 编程的核心不是让 AI 替代思考，而是让 AI 承担一部分执行和探索工作。使用者需要负责目标、判断、边界和验证。</p><p>我现在对 AI coding 的基本判断是：</p><blockquote><p>先想清楚，再让 AI 做；先对齐信息，再追求效率；最后一定要用测试和自己的理解兜底。</p></blockquote></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("topics/ai-coding/AI.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const AI = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  AI as default
};
