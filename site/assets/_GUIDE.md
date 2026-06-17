# 转换指南 — Markdown → 静态 HTML

> **构建方式（2026-06 起）**：已有确定性构建脚本 **`assets/_build.py`**，从最新 markdown 一键重建全站 18 节 + 首页 + 总脉络：在仓库根目录运行 `python3 site/assets/_build.py`（零依赖、幂等，导航/翻页器/计数自动一致）。改动任何 markdown 后跑一次即可。本指南是该脚本的**规格说明 / 人工兜底**。

给「转换 agent」用。把每个 `NN-*/README.md`（以及 `OVERVIEW-发展总脉络.md`、首页）
转成站点 HTML：读 `assets/_TEMPLATE.html`，按下表把 markdown 元素映射成 HTML 结构 +
CSS class，填好 5 个占位符（`{{TITLE}}` `{{SIDEBAR}}` `{{TOC}}` `{{CONTENT}}`
`{{PAGER}}`），写到 `site/<id>.html`。

输出文件名与导航 `id` 对应：
`index.html` `overview.html` `00.html` … `17.html`。
assets 永远用相对路径 `assets/style.css` / `assets/app.js`（页面与 assets/ 同级）。

---

## 0. 全局规则

- 一律 UTF-8、`lang="zh-CN"`、`data-theme="dark"`（模板已设）。
- 正文整体放进模板的 `<article class="content">`（已在模板里），所以
  `{{CONTENT}}` 内**不要**再写 `<article>`/`<main>`。
- 标题文本、属性值都做 HTML 转义（`& < > "`）。代码块内容也要转义。
- 不要引入任何外部 JS/CSS/字体 CDN——全站零依赖。

---

## 1. `{{TITLE}}`

取 markdown 的 H1 文本，去掉前缀 emoji 可选保留，拼成：
`<H1 文本> — Agent/Harness 知识库`
例：`00 · 导论与心智模型 — Agent/Harness 知识库`。
首页用：`Agent / Harness 工程知识库`。

---

## 2. `{{SIDEBAR}}` （全站一致，仅 active 不同）

按下面这份固定 NAV 渲染。**当前页**那一项加 `is-active` 和
`aria-current="page"`，其余不加。`<span class="nav__idx">` 放编号（首页/总脉络用
emoji 即可，可省略 idx span）。

固定模板（把当前页那一个 `nav__link` 换成 `nav__link is-active` 并加
`aria-current="page"`）：

```html
<div class="brand">
  <p class="brand__title">Agent / Harness 工程知识库</p>
  <span class="brand__subtitle">18 节 · 面试向 · Rosé Pine Moon</span>
</div>
<nav class="nav" aria-label="章节导航">
  <a class="nav__link" href="index.html"><span class="nav__idx">🏠</span> 首页</a>
  <a class="nav__link" href="overview.html"><span class="nav__idx">🧭</span> 发展总脉络</a>
  <span class="nav__group-label">章节</span>
  <a class="nav__link" href="00.html"><span class="nav__idx">00</span> 导论与心智模型</a>
  <a class="nav__link" href="01.html"><span class="nav__idx">01</span> Agent 核心与推理范式</a>
  <a class="nav__link" href="02.html"><span class="nav__idx">02</span> Harness 运行时</a>
  <a class="nav__link" href="03.html"><span class="nav__idx">03</span> 上下文工程</a>
  <a class="nav__link" href="04.html"><span class="nav__idx">04</span> 工具与 MCP</a>
  <a class="nav__link" href="05.html"><span class="nav__idx">05</span> 规划与任务分解</a>
  <a class="nav__link" href="06.html"><span class="nav__idx">06</span> 记忆系统</a>
  <a class="nav__link" href="07.html"><span class="nav__idx">07</span> 检索与 RAG</a>
  <a class="nav__link" href="08.html"><span class="nav__idx">08</span> 多智能体编排</a>
  <a class="nav__link" href="09.html"><span class="nav__idx">09</span> 评估</a>
  <a class="nav__link" href="10.html"><span class="nav__idx">10</span> 可观测性与调试</a>
  <a class="nav__link" href="11.html"><span class="nav__idx">11</span> 生产工程</a>
  <a class="nav__link" href="12.html"><span class="nav__idx">12</span> 安全与对抗</a>
  <a class="nav__link" href="13.html"><span class="nav__idx">13</span> 大厂案例研究</a>
  <a class="nav__link" href="14.html"><span class="nav__idx">14</span> 技术栈速查</a>
  <a class="nav__link" href="15.html"><span class="nav__idx">15</span> 面试题库</a>
  <a class="nav__link" href="16.html"><span class="nav__idx">16</span> Agent 训练与强化学习</a>
  <a class="nav__link" href="17.html"><span class="nav__idx">17</span> 互操作协议与 Agent 经济</a>
  <span class="nav__group-label">外观</span>
  <button class="theme-toggle" type="button" data-theme-toggle
          aria-label="切换深浅色" aria-pressed="false" style="margin:6px 12px;">
    <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>
    <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
  </button>
</nav>
```

NAV 权威数据（顺序即此）：
`index/overview/00…17`，label 见上。theme-toggle 可选，去掉也不影响其它功能。

---

## 3. `{{CONTENT}}` 元素映射

| Markdown | HTML 输出 | 说明 |
|---|---|---|
| `> 状态：🟢 已校验`（**正文最顶部那行**） | `<p class="status-badge status-badge--ok">已校验</p>` | 见 §3.1，**先于 H1 输出** |
| `# 标题` | `<h1>标题</h1>` | 每页一个；class 由 CSS 自动渐变 |
| `## N. 标题` | `<h2 id="SLUG">标题 <a class="heading-anchor" href="#SLUG" aria-label="锚点">#</a></h2>` | 见 §3.2 锚点 |
| `### 标题` | `<h3 id="SLUG">标题 <a class="heading-anchor" href="#SLUG">#</a></h3>` | 同上 |
| `#### 标题` | `<h4>标题</h4>` | 不进 TOC、可不加锚点 |
| 段落 | `<p>…</p>` | |
| `**粗**` / `*斜*` | `<strong>` / `<em>` | |
| `` `行内` `` | `<code>行内</code>` | CSS 自动 highlight-med 底 + foam 字 |
| 无序/有序列表 | `<ul>` / `<ol>` + `<li>` | 嵌套保留 |
| `---` | `<hr>` | |
| `> 引用` | `<blockquote><p>…</p></blockquote>` | iris 左条 |
| 普通表格 | `<div class="table-wrap"><table>…</table></div>` | **必须**包 `.table-wrap` 以便横向滚动 |
| 时间线表 | `<div class="table-wrap"><table class="timeline-table">…</table></div>` | 见 §3.3 识别规则 |
| 围栏代码块 | `<pre data-lang="python"><code>…</code></pre>` | 见 §3.4 |
| `[[NN]]` | `<a class="xref" href="NN.html">NN</a>` | 见 §3.5 |
| `[文字](http…)` | `<a href="…" target="_blank" rel="noopener noreferrer">文字</a>` | 外链新标签；CSS 自动加 ↗ |
| `[文字](其它.md)` | 转成对应 `NN.html` 的普通 `<a>` | 内链不开新标签 |
| 🍠 段落/小节 | `<section class="xhs-card">…</section>` | 见 §3.6 |

### 3.1 状态行 → 徽章
正文第一行常是 `> 状态：🟢 已校验`。渲染为绿色 pill，**放在 H1 之前**：
```html
<p class="status-badge status-badge--ok">已校验</p>
```
其它状态：🟡/草拟 → `status-badge--warn`；⚪/未校验 → `status-badge--draft`。
这一行**不要**再渲染成 blockquote。

### 3.2 标题锚点 slug
`id` 生成规则：取标题纯文本，去掉前导编号 `N.`／`N.M`、去掉首尾空格，
中文保留，空格与标点→`-`，全小写，去重时加 `-2`。
也可简单用 `sec-N`（按 H2 顺序）；只要**全页唯一且稳定**即可，TOC 链接要与之一致。
每个 h2/h3 末尾追加 `<a class="heading-anchor" href="#id">#</a>`。

### 3.3 时间线表识别规则
满足**任一**即判为时间线表，给 `<table class="timeline-table">`：
- 表头第一列是「年份／时间／年代／里程碑年份」之一；**或**
- 表头三列形如「年份 | 里程碑 | 为什么(…如何/原因/演进)」；**或**
- 数据首列绝大多数是 `YYYY`、`YYYY-MM`、`YYYY–YYYY` 形态（含被 `**` 包裹的）。

时间线表里首列内容若是 `**2022-10**` 这种，照常转成 `<strong>2022-10</strong>`，
CSS 会把首列整体着成 gold 等宽并加 timeline 节点；无需手动加 class 到 td。

### 3.4 代码块（含 ASCII 框图 / 伪代码）
````
```python
def agent_loop(...):
    ...
```
````
→
```html
<pre data-lang="python"><code>def agent_loop(...):
    ...
</code></pre>
```
要点：
- 内容**逐字转义**（`<>&`），**保留原始空格/换行/box-drawing 字符**（`white-space:pre`）。
- `data-lang` 取围栏语言；无语言可省略该属性。
- 不做语法高亮（保持零依赖）；CSS 已给等宽、圆角、横向滚动、细边框。

### 3.5 内部交叉链接 `[[NN]]`
`[[03]]` → `<a class="xref" href="03.html">03</a>`。
CSS 会自动补 `[ ]` 包裹与下划线渐显，所以**链接文字只写 `03`**，不要自己加方括号。
`[[00]]–[[15]]` 这种区间：分别替换两个 `[[..]]`，中间的 `–` 原样保留。

### 3.6 🍠 社区实战 / 小红书段
当某小节标题或段落带 🍠（如「🍠 社区实战」「小红书」相关），整段包进卡片：
```html
<section class="xhs-card">
  <p class="xhs-card__title">🍠 社区实战</p>
  <p>……正文……</p>
</section>
```
卡片为 rose/love 描边，左上角自动浮出 🍠 角标（CSS `::before`），
所以 `xhs-card__title` 里可不再重复 🍠（重复也无妨）。

---

## 4. `{{TOC}}` 右栏目录（scrollspy）

由本页所有 `h2`（和其下 `h3`）生成。`href` 必须等于对应标题的 `id`。
`app.js` 的 scrollspy 会给当前项的 `.toc__item` 加 `is-active`。

```html
<p class="toc__label">本页目录</p>
<ul class="toc__list">
  <li class="toc__item"><a href="#sec-1">1. TL;DR / 速览</a></li>
  <li class="toc__item toc__item--h3"><a href="#sec-1-1">1.1 子节</a></li>
  <li class="toc__item"><a href="#sec-2">2. 定位与动机</a></li>
  …
</ul>
```
- h3 项加 `toc__item--h3`（缩进）。
- 链接文字可去掉末尾的 `#`，保留编号与标题。
- 页面无 h2 时，`<ul>` 留空即可（窄屏本就隐藏 TOC）。
- 首页（index）一般无 TOC：可整块删掉 `<aside class="toc">`，或留空 `<ul>`。

---

## 5. `{{PAGER}}` 翻页器

按 NAV 顺序取上一页 / 下一页。两侧都有时：
```html
<nav class="pager" aria-label="翻页">
  <a class="pager__link pager__link--prev" href="00.html">
    <span class="pager__dir">← 上一节</span>
    <span class="pager__title">00 · 导论与心智模型</span>
  </a>
  <a class="pager__link pager__link--next" href="02.html">
    <span class="pager__dir">下一节 →</span>
    <span class="pager__title">02 · Harness 运行时</span>
  </a>
</nav>
```
- 只有下一页（如首页/overview 起点）：只输出 `--next` 的 `<a>`，CSS 会把它推到右列。
- 只有上一页（如 `15`）：只输出 `--prev`。
- 首页可整体省略 pager（`{{PAGER}}` 用空串）。
- 翻页顺序：`index → overview → 00 → 01 → … → 17`。

---

## 6. 首页 `index.html` 特殊结构

`{{CONTENT}}` 用 hero + 卡片网格，而非普通文章：
```html
<section class="hero">
  <p class="hero__eyebrow">AGENT · HARNESS · 工程知识库</p>
  <h1 class="hero__title">把 Agent 工程<br>钉成一套可复述的心智模型</h1>
  <p class="hero__lede">18 节面试向知识库：从 harness 运行时到上下文工程、多智能体编排、
     训练与强化学习、互操作协议与 Agent 经济，每节都有历史脉络、机制拆解与考点。</p>
  <div class="hero__meta">
    <span class="pill">Rosé Pine Moon</span>
    <span class="pill">18 节</span>
    <span class="pill">面试向</span>
    <span class="pill">2026-06 刷新</span>
  </div>
</section>

<div class="card-grid">
  <a class="card" href="overview.html">
    <span class="card__idx">🧭 总览</span>
    <span class="card__title">发展总脉络</span>
    <span class="card__desc">一条从 2017 Transformer 到 2026 的主线。</span>
  </a>
  <a class="card" href="00.html">
    <span class="card__idx">00</span>
    <span class="card__title">导论与心智模型</span>
    <span class="card__desc">什么算 Agent、自主性光谱、why-now。</span>
  </a>
  <!-- 01…17 同构，每张 card 取该节 H1 + 一句话定位作 desc -->
</div>
```
首页：`{{TOC}}` 删除、`{{PAGER}}` 只输出指向 `overview` 的 `--next`、侧栏首页项 `is-active`。

---

## 7. 关键 CSS class 速查

- 布局：`.layout` `.sidebar` `.main` `.content` `.toc`
- 导航：`.brand` `.brand__title` `.nav` `.nav__link.is-active` `.nav__idx` `.nav__group-label`
- 移动端：`.topbar` `.hamburger` `.scrim.is-open` `.sidebar.is-open`
- 文章：`.status-badge--ok/warn/draft` `.heading-anchor` `.xref` `.pill`
- 表格：`.table-wrap` `table` / `table.timeline-table`
- 代码：`<pre data-lang>` + `<code>`；行内 `<code>`
- 引用：`blockquote`
- 卡片：`.xhs-card` `.xhs-card__title` `.callout--tip/warn/danger`
- 首页：`.hero` `.hero__title` `.hero__lede` `.card-grid` `.card` `.card__idx/__title/__desc`
- 右栏：`.toc__label` `.toc__list` `.toc__item(.--h3).is-active`
- 页脚：`.pager` `.pager__link--prev/--next` `.to-top.is-visible` `.progress` `.site-footer`

## 8. JS 钩子（data 属性，必须保留）

模板已带；转换时**不要删**这些 hook，否则交互失效：
`data-progress` `data-drawer-toggle` `data-scrim` `data-sidebar`
`data-toc` `data-to-top` `data-theme-toggle`。
