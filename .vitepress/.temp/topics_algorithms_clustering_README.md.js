import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"聚类算法笔记","description":"","frontmatter":{},"headers":[],"relativePath":"topics/algorithms/clustering/README.md","filePath":"topics/algorithms/clustering/README.md"}');
const _sfc_main = { name: "topics/algorithms/clustering/README.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="聚类算法笔记" tabindex="-1">聚类算法笔记 <a class="header-anchor" href="#聚类算法笔记" aria-label="Permalink to &quot;聚类算法笔记&quot;">​</a></h1><p>这里收纳和聚类算法、记忆系统聚类改造相关的笔记。</p><p>不放外部论文原文；论文 PDF 放到 <code>reference/papers/</code>。这里主要保留自己的理解、工程方案和改造思路。</p><h2 id="当前笔记" tabindex="-1">当前笔记 <a class="header-anchor" href="#当前笔记" aria-label="Permalink to &quot;当前笔记&quot;">​</a></h2><ul><li><a href="./聚类算法">聚类算法</a>：当前工程里已有 memcell 聚类逻辑的理解。</li><li><a href="./聚类算法工程实现">聚类算法工程实现</a>：CluStream 论文和流式聚类框架整理。</li><li><a href="./增量聚类改造方案">增量聚类改造方案</a>：把 BIRCH-style online micro-cluster 裁剪到 Mira 记忆系统的方案。</li><li><a href="./其他项目使用的算法">其他项目使用的算法</a>：其他模块里涉及的算法整理。</li></ul><h2 id="主线" tabindex="-1">主线 <a class="header-anchor" href="#主线" aria-label="Permalink to &quot;主线&quot;">​</a></h2><p>当前问题可以概括为：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>当前：cell 变化 -&gt; 全量读取所有 memcell -&gt; 全量重聚类</span></span>
<span class="line"><span>目标：cell 变化 -&gt; 只更新受影响 cluster</span></span></code></pre></div></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("topics/algorithms/clustering/README.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const README = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  README as default
};
