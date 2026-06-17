#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Deterministic Markdown -> static HTML builder for the Agent/Harness 知识库.
Regenerates site/index.html, site/overview.html, site/00.html … site/17.html
from the source markdown, following site/assets/_GUIDE.md conventions.

Run:  python3 site/assets/_build.py     (from repo root)
Idempotent; safe to re-run after editing any markdown.
"""
import os, re, html, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SITE = os.path.join(ROOT, "site")
TPL = open(os.path.join(SITE, "assets", "_TEMPLATE.html"), encoding="utf-8").read()
# strip the top documentation comment (it mentions {{...}} placeholders verbatim,
# which would otherwise be substituted and duplicate the sidebar/title)
TPL = re.sub(r"<!--.*?-->", "", TPL, count=1, flags=re.S)

# ---- canonical section registry (order == nav order == pager order) ----
SECTIONS = [
    ("00", "00-导论与心智模型", "导论与心智模型", "什么算 Agent、自主性光谱、why-now"),
    ("01", "01-Agent核心与推理范式", "Agent 核心与推理范式", "ReAct / Reflexion / 推理模型 / RLVR"),
    ("02", "02-Harness运行时", "Harness 运行时", "主循环 · 工具调用 · brain/hands/session"),
    ("03", "03-上下文工程", "上下文工程", "context engineering · 四动词 · compaction"),
    ("04", "04-工具与MCP", "工具与 MCP", "工具设计 · MCP · code-execution · Skills"),
    ("05", "05-规划与任务分解", "规划与任务分解", "分解 · 反思 · TODO · plan-then-execute"),
    ("06", "06-记忆系统", "记忆系统", "长短期记忆 · 存储检索 · 持续学习"),
    ("07", "07-检索与RAG", "检索与 RAG", "向量库 · agentic RAG · 多模态检索"),
    ("08", "08-多智能体编排", "多智能体编排", "supervisor · 子 agent · 单 vs 多"),
    ("09", "09-评估", "评估", "轨迹评估 · 基准生命周期 · LLM-judge"),
    ("10", "10-可观测性与调试", "可观测性与调试", "tracing · OTel GenAI · 失败归因"),
    ("11", "11-生产工程", "生产工程", "时延 · 成本 · FinOps · 护栏 · AgentOps"),
    ("12", "12-安全与对抗", "安全与对抗", "prompt 注入 · 沙箱 · 治理合规"),
    ("13", "13-大厂案例研究", "大厂案例研究", "Claude Code · Cursor · Devin · 市场现实"),
    ("14", "14-技术栈速查", "技术栈速查", "框架 / 向量库 / 协议 选型矩阵"),
    ("15", "15-面试题库", "面试题库", "概念 · 系统设计 · 手写 · 项目深挖"),
    ("16", "16-Agent训练与强化学习", "Agent 训练与强化学习", "RLHF/RLVR · GRPO · agentic RL · 轨迹蒸馏"),
    ("17", "17-互操作协议与Agent经济", "互操作协议与 Agent 经济", "MCP · A2A · 身份发现 · AP2/ACP 支付"),
]
# 附录页：小红书情报快照（社媒情报，非正文章节）
INTEL = ("intel", "_小红书情报快照-2026-06.md", "小红书情报快照",
         "社媒情报：趋势 · 民间认知校验 · 面经")
# page order for pager: index -> overview -> 00..17 -> intel(附录)
PAGES = [("index", "🏠 首页"), ("overview", "🧭 发展总脉络")] + [
    (sid, f"{sid} · {title}") for sid, _d, title, _desc in SECTIONS] + [
    ("intel", "📕 小红书情报快照")]

# ----------------------------- inline -----------------------------
_PH = "\x00%d\x00"
_PIPE_PH = "\x00PIPE\x00"  # protects literal | inside inline code from table column splitting

def esc(t):
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def inline(text):
    store = []
    def stash(htmlfrag):
        store.append(htmlfrag)
        return _PH % (len(store) - 1)
    # 1. inline code
    text = re.sub(r"`([^`]+)`", lambda m: stash("<code>%s</code>" % esc(m.group(1))), text)
    # 2. autolink <http...>
    text = re.sub(r"<(https?://[^>\s]+)>",
                  lambda m: stash('<a href="%s" target="_blank" rel="noopener noreferrer">%s</a>' % (m.group(1), esc(m.group(1)))), text)
    # 3. cross refs [[NN]] (also tolerate a verbose label: [[NN 名称]]) and [[README]]
    text = re.sub(r"\[\[README\]\]",
                  lambda m: stash('<a class="xref" href="index.html">README</a>'), text)
    text = re.sub(r"\[\[(\d{2})(?:[ ·\-—][^\]]*)?\]\]",
                  lambda m: stash('<a class="xref" href="%s.html">%s</a>' % (m.group(1), m.group(1))), text)
    # 3b. meta-doc cross refs that have a built page
    text = re.sub(r"\[\[OVERVIEW[^\]]*\]\]",
                  lambda m: stash('<a class="xref" href="overview.html">发展总脉络</a>'), text)
    text = re.sub(r"\[\[_?小红书情报快照[^\]]*\]\]",
                  lambda m: stash('<a class="xref" href="intel.html">小红书情报快照</a>'), text)
    # 3c. meta-docs without a page -> render the inner label as plain text (no bare [[ ]])
    text = re.sub(r"\[\[_?(事实基线[^\]]*|REVIEW[^\]]*|PLAN[^\]]*)\]\]",
                  lambda m: esc(m.group(1)), text)
    # 4. markdown links [text](url)
    def md_link(m):
        label, url = m.group(1), m.group(2)
        if url.startswith("http"):
            return stash('<a href="%s" target="_blank" rel="noopener noreferrer">%s</a>' % (url, inline(label)))
        # internal links to chapter docs (.md) or chapter directories -> built page, with fallback
        bare = url.split("#", 1)[0]
        anchor = url[len(bare):]
        if bare.endswith(".md") or url.endswith("/") or re.match(r"^\.{0,2}/?\d{2}-", bare):
            base = bare.rstrip("/")
            mm = re.search(r"(?:^|/)(\d{2})-", base)
            if mm:
                href = mm.group(1) + ".html"
            elif "overview" in base.lower() or "总脉络" in base:
                href = "overview.html"
            else:
                href = "index.html"
            return stash('<a href="%s%s">%s</a>' % (href, anchor, inline(label)))
        return stash('<a href="%s">%s</a>' % (esc(url), inline(label)))
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", md_link, text)
    # 5. bare urls
    text = re.sub(r"(?<![\"'>=])(https?://[^\s<>()]+)",
                  lambda m: stash('<a href="%s" target="_blank" rel="noopener noreferrer">%s</a>' % (m.group(1), esc(m.group(1)))), text)
    # escape the rest
    text = esc(text)
    # bold then italic
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<!\*)\*(?!\*)([^*]+?)\*(?!\*)", r"<em>\1</em>", text)
    # restore placeholders
    for i, frag in enumerate(store):
        text = text.replace(_PH % i, frag)
    return text

# ----------------------------- helpers -----------------------------
YEAR_HEAD = {"年份", "时间", "年代", "里程碑年份", "年月", "年代/时间"}

def is_timeline(header, rows):
    h0 = re.sub(r"[*\s]", "", header[0]) if header else ""
    if h0 in YEAR_HEAD:
        return True
    if rows:
        yearish = sum(1 for r in rows if re.match(r"^\**\s*\d{4}", r[0].strip()))
        if yearish >= max(1, len(rows) * 0.5):
            return True
    return False

def emit_table(lines):
    rows = []
    for ln in lines:
        s = ln.strip()
        if s.startswith("|"):
            s = s[1:]
        if s.endswith("|"):
            s = s[:-1]
        # shield literal | inside inline code spans so it isn't read as a column separator
        s = re.sub(r"`[^`]*`", lambda mm: mm.group(0).replace("|", _PIPE_PH), s)
        rows.append([c.strip().replace(_PIPE_PH, "|") for c in s.split("|")])
    header = rows[0]
    body = rows[2:]  # rows[1] is the |---| separator
    cls = ' class="timeline-table"' if is_timeline(header, body) else ""
    out = ['<div class="table-wrap">', '<table%s>' % cls, "<thead><tr>%s</tr></thead>" %
           "".join("<th>%s</th>" % inline(c) for c in header), "<tbody>"]
    for r in body:
        # pad/truncate to header width
        while len(r) < len(header):
            r.append("")
        out.append("<tr>%s</tr>" % "".join("<td>%s</td>" % inline(c) for c in r[:len(header)]))
    out += ["</tbody>", "</table>", "</div>"]
    return "\n".join(out)

def parse_list(lines, base_indent=0):
    """lines: list of (indent, marker_type, marker_raw, content). Returns html."""
    out = []
    i = 0
    while i < len(lines):
        indent, mtype, mraw, content = lines[i]
        tag = "ol" if mtype == "ol" else "ul"
        start = ""
        if mtype == "ol":
            num = int(re.match(r"(\d+)", mraw).group(1))
            if num != 1:
                start = ' start="%d"' % num
        # gather all items at this indent level (same tag)
        items = []
        while i < len(lines) and lines[i][0] == indent and lines[i][1] == mtype:
            item_content = [lines[i][3]]
            j = i + 1
            children = []
            while j < len(lines) and lines[j][0] > indent:
                children.append(lines[j])
                j += 1
            items.append((item_content, children))
            i = j
            # break if next item is a different marker type at same indent (rare) -> new list
            if i < len(lines) and lines[i][0] == indent and lines[i][1] != mtype:
                break
        out.append("<%s%s>" % (tag, start))
        for content_lines, children in items:
            inner = inline(content_lines[0])
            if children:
                inner += "\n" + parse_list(children, base_indent + 1)
            out.append("<li>%s</li>" % inner)
        out.append("</%s>" % tag)
    return "\n".join(out)

LIST_RE = re.compile(r"^(\s*)([-*+]|\d+\.)\s+(.*)$")

def block_parse(text, collect_headings=None):
    """Convert markdown body text to HTML. collect_headings: optional list to append (level,id,label)."""
    lines = text.split("\n")
    out = []
    i = 0
    n = len(lines)
    h2_count = 0
    h3_count = 0
    while i < n:
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        # headings
        m = re.match(r"^(#{1,4})\s+(.*)$", line)
        if m:
            level = len(m.group(1))
            raw = m.group(2).strip().rstrip("#").strip()
            if level == 1:
                out.append("<h1>%s</h1>" % inline(raw))
            elif level == 2:
                h2_count += 1
                h3_count = 0
                hid = "sec-%d" % h2_count
                out.append('<h2 id="%s">%s <a class="heading-anchor" href="#%s" aria-label="锚点">#</a></h2>' % (hid, inline(raw), hid))
                if collect_headings is not None:
                    collect_headings.append((2, hid, raw))
            elif level == 3:
                h3_count += 1
                hid = "sec-%d-%d" % (h2_count, h3_count)
                out.append('<h3 id="%s">%s <a class="heading-anchor" href="#%s" aria-label="锚点">#</a></h3>' % (hid, inline(raw), hid))
                if collect_headings is not None:
                    collect_headings.append((3, hid, raw))
            else:
                out.append("<h4>%s</h4>" % inline(raw))
            i += 1
            continue
        # hr
        if re.match(r"^(-{3,}|\*{3,})\s*$", line):
            out.append("<hr>")
            i += 1
            continue
        # fenced code (take only the first language token; tolerate ```python title=... and c++)
        mf = re.match(r"^```\s*([^\s`]+)?", line.strip())
        if mf:
            lang = mf.group(1)
            j = i + 1
            buf = []
            while j < n and not lines[j].strip().startswith("```"):
                buf.append(lines[j])
                j += 1
            code = esc("\n".join(buf))
            attr = ' data-lang="%s"' % lang if lang else ""
            out.append("<pre%s><code>%s\n</code></pre>" % (attr, code))
            i = j + 1
            continue
        # table
        if line.strip().startswith("|") and i + 1 < n and re.match(r"^\s*\|?[\s:|-]+\|?\s*$", lines[i + 1]) and "-" in lines[i + 1]:
            j = i
            tbl = []
            while j < n and lines[j].strip().startswith("|"):
                tbl.append(lines[j])
                j += 1
            out.append(emit_table(tbl))
            i = j
            continue
        # blockquote (incl status badge handled by caller for first line)
        if line.lstrip().startswith(">"):
            j = i
            inner = []
            while j < n and lines[j].lstrip().startswith(">"):
                stripped = re.sub(r"^\s*>\s?", "", lines[j])
                inner.append(stripped)
                j += 1
            out.append("<blockquote>\n%s\n</blockquote>" % block_parse("\n".join(inner)))
            i = j
            continue
        # list
        if LIST_RE.match(line):
            j = i
            litems = []
            while j < n and (LIST_RE.match(lines[j]) or (lines[j].strip() and lines[j].startswith(" ") and litems)):
                lm = LIST_RE.match(lines[j])
                if lm:
                    indent = len(lm.group(1))
                    mtype = "ol" if re.match(r"\d+\.", lm.group(2)) else "ul"
                    litems.append((indent, mtype, lm.group(2), lm.group(3)))
                else:
                    # continuation line: append to last item's content
                    if litems:
                        ind, mt, mr, ct = litems[-1]
                        litems[-1] = (ind, mt, mr, ct + " " + lines[j].strip())
                j += 1
                # stop on blank line that is followed by non-list
                if j < n and not lines[j].strip():
                    k = j + 1
                    while k < n and not lines[k].strip():
                        k += 1
                    if k < n and LIST_RE.match(lines[k]):
                        j = k
                    else:
                        break
            # normalize indents to levels
            indents = sorted(set(x[0] for x in litems))
            lvl = {ind: idx for idx, ind in enumerate(indents)}
            norm = [(lvl[ind], mt, mr, ct) for (ind, mt, mr, ct) in litems]
            out.append(parse_list(norm))
            i = j
            continue
        # paragraph
        buf = [line]
        j = i + 1
        while j < n and lines[j].strip() and not re.match(r"^(#{1,4}\s|```|>|\s*[-*+]\s|\s*\d+\.\s|-{3,}\s*$)", lines[j]) and not lines[j].strip().startswith("|"):
            buf.append(lines[j])
            j += 1
        out.append("<p>%s</p>" % inline(" ".join(x.strip() for x in buf)))
        i = j
    return "\n".join(out)

BADGE = {"🟢": ("ok", "已校验"), "🟡": ("warn", "进行中"), "⚪": ("draft", "未校验"), "🔴": ("draft", "待填充")}

def convert_markdown(md):
    lines = md.split("\n")
    badge_html = ""
    # status badge if first non-empty line is "> 状态：…"
    k = 0
    while k < len(lines) and not lines[k].strip():
        k += 1
    if k < len(lines) and re.match(r"^\s*>\s*状态", lines[k]):
        txt = re.sub(r"^\s*>\s*状态[:：]\s*", "", lines[k]).strip()
        emoji = txt[0]
        label = txt[1:].strip() if emoji in BADGE else txt
        cls, default = BADGE.get(emoji, ("ok", "已校验"))
        badge_html = '<p class="status-badge status-badge--%s">%s</p>' % (cls, esc(label or default))
        del lines[k]
    headings = []
    body = block_parse("\n".join(lines), collect_headings=headings)
    content = (badge_html + "\n" + body) if badge_html else body
    return content, headings

# ----------------------------- assembly -----------------------------
def sidebar(active):
    rows = ['<div class="brand">',
            '  <p class="brand__title">Agent / Harness 工程知识库</p>',
            '  <span class="brand__subtitle">18 节 · 面试向 · Rosé Pine Moon</span>',
            '</div>',
            '<nav class="nav" aria-label="章节导航">']
    def link(href, idx, label, key):
        cls = "nav__link is-active" if key == active else "nav__link"
        cur = ' aria-current="page"' if key == active else ""
        return '  <a class="%s" href="%s"%s><span class="nav__idx">%s</span> %s</a>' % (cls, href, cur, idx, label)
    rows.append(link("index.html", "🏠", "首页", "index"))
    rows.append(link("overview.html", "🧭", "发展总脉络", "overview"))
    rows.append('  <span class="nav__group-label">章节</span>')
    for sid, _d, title, _desc in SECTIONS:
        rows.append(link("%s.html" % sid, sid, title, sid))
    rows.append('  <span class="nav__group-label">附录</span>')
    rows.append(link("intel.html", "📕", INTEL[2], "intel"))
    rows.append('  <span class="nav__group-label">外观</span>')
    rows.append('''  <button class="theme-toggle" type="button" data-theme-toggle
          aria-label="切换深浅色" aria-pressed="false" style="margin:6px 12px;">
    <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>
    <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
  </button>''')
    rows.append('</nav>')
    return "\n".join(rows)

def toc(headings):
    if not headings:
        return '<p class="toc__label">本页目录</p>\n<ul class="toc__list"></ul>'
    rows = ['<p class="toc__label">本页目录</p>', '<ul class="toc__list">']
    for level, hid, label in headings:
        cls = "toc__item toc__item--h3" if level == 3 else "toc__item"
        rows.append('  <li class="%s"><a href="#%s">%s</a></li>' % (cls, hid, inline(label)))
    rows.append("</ul>")
    return "\n".join(rows)

def pager(key):
    keys = [k for k, _ in PAGES]
    if key not in keys:
        return ""
    idx = keys.index(key)
    parts = ['<nav class="pager" aria-label="翻页">']
    if idx > 0:
        pk, pt = PAGES[idx - 1]
        parts.append('  <a class="pager__link pager__link--prev" href="%s.html">' % pk)
        parts.append('    <span class="pager__dir">← 上一节</span>')
        parts.append('    <span class="pager__title">%s</span>' % pt)
        parts.append('  </a>')
    if idx < len(PAGES) - 1:
        nk, nt = PAGES[idx + 1]
        parts.append('  <a class="pager__link pager__link--next" href="%s.html">' % nk)
        parts.append('    <span class="pager__dir">下一节 →</span>')
        parts.append('    <span class="pager__title">%s</span>' % nt)
        parts.append('  </a>')
    parts.append('</nav>')
    return "\n".join(parts)

def render(title, active, content, headings, pgkey, drop_toc=False):
    page = TPL
    page = page.replace("{{TITLE}}", html.escape(title, quote=True))
    page = page.replace("{{SIDEBAR}}", sidebar(active))
    page = page.replace("{{TOC}}", "" if drop_toc else toc(headings))
    page = page.replace("{{CONTENT}}", content)
    page = page.replace("{{PAGER}}", pager(pgkey))
    return page

def build_index():
    hero = '''<section class="hero">
  <p class="hero__eyebrow">AGENT · HARNESS · 工程知识库</p>
  <h1 class="hero__title">把 Agent 工程<br>钉成一套可复述的心智模型</h1>
  <p class="hero__lede">18 节面试向知识库：从 harness 运行时到上下文工程、多智能体编排、训练与强化学习、互操作协议与 Agent 经济，每节都有历史脉络、机制拆解与考点。</p>
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
  </a>'''
    cards = [hero]
    for sid, _d, title, desc in SECTIONS:
        cards.append('''  <a class="card" href="%s.html">
    <span class="card__idx">%s</span>
    <span class="card__title">%s</span>
    <span class="card__desc">%s。</span>
  </a>''' % (sid, sid, html.escape(title), html.escape(desc)))
    cards.append('''  <a class="card" href="intel.html">
    <span class="card__idx">📕 附录</span>
    <span class="card__title">%s</span>
    <span class="card__desc">%s。</span>
  </a>''' % (html.escape(INTEL[2]), html.escape(INTEL[3])))
    cards.append("</div>")
    content = "\n".join(cards)
    return render("Agent / Harness 工程知识库", "index", content, [], "index", drop_toc=True)

def main():
    # index
    open(os.path.join(SITE, "index.html"), "w", encoding="utf-8").write(build_index())
    print("wrote index.html")
    # overview
    md = open(os.path.join(ROOT, "OVERVIEW-发展总脉络.md"), encoding="utf-8").read()
    content, headings = convert_markdown(md)
    open(os.path.join(SITE, "overview.html"), "w", encoding="utf-8").write(
        render("发展总脉络 — Agent/Harness 知识库", "overview", content, headings, "overview"))
    print("wrote overview.html")
    # sections
    for sid, d, title, _desc in SECTIONS:
        md = open(os.path.join(ROOT, d, "README.md"), encoding="utf-8").read()
        content, headings = convert_markdown(md)
        open(os.path.join(SITE, "%s.html" % sid), "w", encoding="utf-8").write(
            render("%s · %s — Agent/Harness 知识库" % (sid, title), sid, content, headings, sid))
        print("wrote %s.html" % sid)
    # 附录：小红书情报快照
    md = open(os.path.join(ROOT, INTEL[1]), encoding="utf-8").read()
    content, headings = convert_markdown(md)
    open(os.path.join(SITE, "%s.html" % INTEL[0]), "w", encoding="utf-8").write(
        render("%s — Agent/Harness 知识库" % INTEL[2], INTEL[0], content, headings, INTEL[0]))
    print("wrote %s.html" % INTEL[0])

if __name__ == "__main__":
    main()
