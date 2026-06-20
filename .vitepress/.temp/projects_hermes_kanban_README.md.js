import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Kanban 笔记索引","description":"","frontmatter":{},"headers":[],"relativePath":"projects/hermes/kanban/README.md","filePath":"projects/hermes/kanban/README.md"}');
const _sfc_main = { name: "projects/hermes/kanban/README.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="kanban-笔记索引" tabindex="-1">Kanban 笔记索引 <a class="header-anchor" href="#kanban-笔记索引" aria-label="Permalink to &quot;Kanban 笔记索引&quot;">​</a></h1><p>这里放 Hermes Kanban 相关的中文整理笔记。</p><h2 id="推荐阅读顺序" tabindex="-1">推荐阅读顺序 <a class="header-anchor" href="#推荐阅读顺序" aria-label="Permalink to &quot;推荐阅读顺序&quot;">​</a></h2><ol><li><a href="./多agent协作">多agent协作</a></li><li><a href="./Hermes Kanban 核心概念">Hermes Kanban 核心概念</a></li><li><a href="./Worker Lane 与任务执行">Worker Lane 与任务执行</a></li><li><a href="./Worker 心跳与任务租约">Worker 心跳与任务租约</a></li><li><a href="./Kanban 使用场景">Kanban 使用场景</a></li><li><a href="./多 Gateway 与 Dispatcher 部署">多 Gateway 与 Dispatcher 部署</a></li></ol><h2 id="主题说明" tabindex="-1">主题说明 <a class="header-anchor" href="#主题说明" aria-label="Permalink to &quot;主题说明&quot;">​</a></h2><ul><li><code>多agent协作</code>：对照 Hermes Kanban v1 spec，整理多 Agent 协作的核心设计。</li><li><code>Hermes Kanban 核心概念</code>：整理 Board、Task、Link、Comment、Workspace、Dispatcher、Tenant 等概念。</li><li><code>Worker Lane 与任务执行</code>：整理任务卡如何被 worker 执行，以及 worker 的生命周期契约。</li><li><code>Worker 心跳与任务租约</code>：整理 heartbeat、TTL、claim、lease、stale recovery。</li><li><code>Kanban 使用场景</code>：整理教程里的典型场景。</li><li><code>多 Gateway 与 Dispatcher 部署</code>：整理多个 gateway 并存时 dispatcher 的 owner 问题。</li></ul></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("projects/hermes/kanban/README.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const README = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  README as default
};
