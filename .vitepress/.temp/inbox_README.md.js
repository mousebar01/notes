import { ssrRenderAttrs } from "vue/server-renderer";
import { useSSRContext } from "vue";
import { _ as _export_sfc } from "./plugin-vue_export-helper.1tPrXgE0.js";
const __pageData = JSON.parse('{"title":"Inbox","description":"","frontmatter":{},"headers":[],"relativePath":"inbox/README.md","filePath":"inbox/README.md"}');
const _sfc_main = { name: "inbox/README.md" };
function _sfc_ssrRender(_ctx, _push, _parent, _attrs, $props, $setup, $data, $options) {
  _push(`<div${ssrRenderAttrs(_attrs)}><h1 id="inbox" tabindex="-1">Inbox <a class="header-anchor" href="#inbox" aria-label="Permalink to &quot;Inbox&quot;">​</a></h1><p>这里用于放临时记录、速记和暂时还没想清楚归属的想法。</p><p>不需要在这里复杂分类；如果主题已经明确，再移动到 <code>topics/</code> 或 <code>projects/</code>。</p><p>建议命名：</p><div class="language-text vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">text</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span>2026-06-17-简短主题.md</span></span></code></pre></div><p>整理时可以判断它更适合进入 <code>topics/</code>、<code>projects/</code> 还是 <code>reviews/</code>。</p></div>`);
}
const _sfc_setup = _sfc_main.setup;
_sfc_main.setup = (props, ctx) => {
  const ssrContext = useSSRContext();
  (ssrContext.modules || (ssrContext.modules = /* @__PURE__ */ new Set())).add("inbox/README.md");
  return _sfc_setup ? _sfc_setup(props, ctx) : void 0;
};
const README = /* @__PURE__ */ _export_sfc(_sfc_main, [["ssrRender", _sfc_ssrRender]]);
export {
  __pageData,
  README as default
};
