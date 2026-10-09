import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  detectContentElement,
  detectMainContentWithRoot,
  extractTextFromContainer,
  isValidSelector,
  setNoiseSelector,
} from "../content/contentDetection";
import { DEFAULT_NOISE_SELECTORS } from "@/shared/types";

// Realistic page skeletons. Each test pins which element the heuristics pick
// and what gets read, so heuristic changes show up as explicit diffs here.

function sentences(label: string, count: number): string {
  return Array.from({ length: count }, (_, index) => `${label} sentence ${index} carries some readable words.`).join(" ");
}

function paragraphs(label: string, count: number): string {
  return Array.from({ length: count }, (_, index) => `<p>${sentences(`${label} ${index}`, 3)}</p>`).join("");
}

function links(label: string, count: number): string {
  return Array.from({ length: count }, (_, index) => `<a href="/${label}-${index}">${label} link ${index}</a>`).join(" ");
}

const ARTICLE_PAGE = `
  <header id="site-header"><a href="/">Daily Paper</a><nav>${links("section", 12)}</nav></header>
  <article id="story">
    <header><h1>Headline of the story</h1><p class="byline">By A. Writer</p></header>
    ${paragraphs("story", 8)}
    <aside id="callout"><p>${sentences("callout", 2)}</p></aside>
  </article>
  <aside id="related"><h2>Related</h2>${links("related", 6)}</aside>
  <footer>${sentences("footer", 3)}</footer>
`;

function githubFileRows(count: number): string {
  return Array.from({ length: count }, (_, index) => `
    <tr>
      <td><a href="/repo/blob/main/file-${index}.ts">file-${index}.ts</a></td>
      <td><a href="/repo/commit/${index}">Update file ${index} with a fix</a></td>
      <td><relative-time>2 years ago</relative-time></td>
    </tr>`).join("");
}

const GITHUB_PAGE = `
  <header class="AppHeader"><nav>${links("global", 10)}</nav></header>
  <main id="repo-main">
    <div id="repo-content">
      <div class="file-navigation"><button>main</button><button>Go to file</button><button>Code</button></div>
      <table class="files"><tbody>${githubFileRows(20)}</tbody></table>
      <article id="readme" class="markdown-body"><h1>Project</h1>${paragraphs("readme", 8)}</article>
    </div>
  </main>
`;

function relatedCards(count: number): string {
  return Array.from({ length: count }, (_, index) => `
    <div class="card"><a href="/post-${index}">Related post number ${index} title</a><p>${sentences(`teaser ${index}`, 1)}</p></div>`).join("");
}

const DIV_SOUP_PAGE = `
  <div id="app">
    <div class="topbar"><div class="logo">Brand</div><div class="links">${links("top", 8)}</div><div class="greeting">Welcome back, reader. You have three unread notifications.</div></div>
    <div class="layout">
      <div class="post-content">
        <h1>Post title</h1>
        ${paragraphs("post", 8)}
      </div>
      <div class="related-posts"><h3>More posts</h3>${relatedCards(4)}</div>
    </div>
  </div>
`;

function hnComment(index: number, paragraphCount: number): string {
  const extra = Array.from({ length: paragraphCount }, (_, p) => `<p>${sentences(`comment ${index} paragraph ${p}`, 2)}</p>`).join("");
  return `
    <tr class="athing comtr" id="c${index}"><td><table><tbody><tr>
      <td class="ind"></td>
      <td class="votelinks"><a href="vote?id=${index}"><div class="votearrow"></div></a></td>
      <td class="default">
        <div><span class="comhead"><a class="hnuser" href="user?id=u${index}">user${index}</a> <span class="age"><a href="item?id=${index}">2 hours ago</a></span></span></div>
        <div class="comment"><div class="commtext c00">${sentences(`comment ${index} lead`, 2)}${extra}</div></div>
      </td>
    </tr></tbody></table></td></tr>`;
}

const HN_PAGE = `
  <center><table id="hnmain"><tbody>
    <tr><td><table><tbody><tr><td><span class="pagetop">${links("hn", 6)}</span></td></tr></tbody></table></td></tr>
    <tr><td>
      <table class="fatitem"><tbody><tr class="athing"><td class="title"><span class="titleline"><a href="https://example.com/story">Story title on the front page</a></span></td></tr></tbody></table>
      <table class="comment-tree" id="tree"><tbody>
        ${[hnComment(1, 2), hnComment(2, 0), hnComment(3, 3), hnComment(4, 1), hnComment(5, 0)].join("")}
      </tbody></table>
    </td></tr>
  </tbody></table></center>
`;

function forumPosts(lengths: number[]): string {
  return lengths.map((count, index) => `
    <article class="post" id="post-${index}"><div class="author">member${index}</div><div class="body">${paragraphs(`post ${index}`, count)}</div></article>`).join("");
}

const FORUM_PAGE = `
  <div id="forum-header"><a href="/">Forum</a> ${links("board", 5)}</div>
  <div id="thread"><h1>Thread: how do I fix this?</h1>${forumPosts([2, 3, 1, 2, 2])}</div>
  <div id="forum-footer">${links("legal", 4)}</div>
`;

const DOCS_PAGE = `
  <div class="docs">
    <nav class="sidebar">${links("doc", 30)}</nav>
    <main id="docs-main">
      <article id="doc"><h1>API reference</h1>${paragraphs("doc", 6)}<pre>const x = 1;</pre></article>
      <aside class="toc">${links("toc", 6)}</aside>
    </main>
  </div>
`;

describe("content detection on realistic pages", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    setNoiseSelector(DEFAULT_NOISE_SELECTORS);
  });

  afterEach(() => {
    setNoiseSelector(DEFAULT_NOISE_SELECTORS);
  });

  it("article page: reads the story with its headline and in-article callout", () => {
    document.body.innerHTML = ARTICLE_PAGE;
    const content = detectMainContentWithRoot();
    expect(content?.root?.id).toBe("story");
    expect(content?.text).toContain("Headline of the story");
    expect(content?.text).toContain("callout sentence 0");
    expect(content?.text).not.toContain("By A. Writer");
    expect(content?.text).not.toContain("section link");
  });

  it("GitHub-like page: reads the README inside <main>, not the file table", () => {
    document.body.innerHTML = GITHUB_PAGE;
    const content = detectMainContentWithRoot();
    expect(content?.root?.id).toBe("readme");
    expect(content?.text).not.toContain("file-0.ts");
  });

  it("div-soup app shell: reads the post, not the top bar or related posts", () => {
    document.body.innerHTML = DIV_SOUP_PAGE;
    const content = detectMainContentWithRoot();
    expect(content?.root?.className).toBe("post-content");
    expect(content?.text).toContain("Post title");
    expect(content?.text).not.toContain("Welcome back");
    expect(content?.text).not.toContain("teaser 0");
  });

  it("HN-like table of comments: reads every comment, including each lead paragraph", () => {
    document.body.innerHTML = HN_PAGE;
    const content = detectMainContentWithRoot();
    expect(document.getElementById("tree")?.contains(content?.root ?? null)).toBe(true);
    for (const index of [1, 2, 3, 4, 5]) {
      expect(content?.text).toContain(`comment ${index} lead sentence 0`);
    }
    expect(content?.text).toContain("comment 3 paragraph 2 sentence 1");
  });

  it("forum with many <article> posts: reads the whole thread", () => {
    document.body.innerHTML = FORUM_PAGE;
    const content = detectMainContentWithRoot();
    expect(content?.root?.id).toBe("thread");
    for (const index of [0, 1, 2, 3, 4]) {
      expect(content?.text).toContain(`post ${index} 0 sentence 0`);
    }
    expect(content?.text).not.toContain("legal link");
  });

  it("docs page with sidebar: reads the doc, not the sidebar or table of contents", () => {
    document.body.innerHTML = DOCS_PAGE;
    const content = detectMainContentWithRoot();
    expect(["docs-main", "doc"]).toContain(content?.root?.id);
    expect(content?.text).toContain("API reference");
    expect(content?.text).not.toContain("doc link");
    expect(content?.text).not.toContain("toc link");
  });

  it("skips a hidden <main> and uses the visible content", () => {
    document.body.innerHTML = `
      <main id="stale" hidden>${paragraphs("stale", 4)}</main>
      <article id="visible">${paragraphs("visible", 4)}</article>
    `;
    expect(detectContentElement()?.id).toBe("visible");
  });

  it("keeps <main> when its articles are a list of similar posts", () => {
    document.body.innerHTML = `<main id="feed">${forumPosts([2, 2, 2])}</main>`;
    expect(detectContentElement()?.id).toBe("feed");
  });

  it("does not expand a long story to its short related-article teasers", () => {
    document.body.innerHTML = `
      <div id="page">
        <article id="story"><h1>Story</h1>${paragraphs("story", 6)}</article>
        <article class="teaser">${paragraphs("teaser a", 1)}</article>
        <article class="teaser">${paragraphs("teaser b", 1)}</article>
        <article class="teaser">${paragraphs("teaser c", 1)}</article>
      </div>
    `;
    expect(detectContentElement()?.id).toBe("story");
  });

  it("reads a container whose text is direct text with no block children", () => {
    document.body.innerHTML = `
      <div id="nav">${links("menu", 3)}</div>
      <div id="post">${sentences("direct", 6)}<br>${sentences("after break", 2)}</div>
    `;
    const content = detectMainContentWithRoot();
    expect(content?.root?.id).toBe("post");
    expect(content?.text).toContain("direct sentence 0");
    expect(content?.text).toContain("after break sentence 1");
  });
});

describe("extractTextFromContainer on nested structures", () => {
  beforeEach(() => {
    setNoiseSelector(DEFAULT_NOISE_SELECTORS);
  });

  it("keeps an outer list item's own text before its nested list", () => {
    document.body.innerHTML = `
      <div id="container">
        <ul>
          <li>Outer item text
            <ul><li>Inner one</li><li>Inner two</li></ul>
          </li>
          <li>Second outer</li>
        </ul>
      </div>
    `;
    const text = extractTextFromContainer(document.getElementById("container")!);
    expect(text).toBe("Outer item text\nInner one\nInner two\nSecond outer");
  });

  it("keeps text that follows a nested block in order", () => {
    document.body.innerHTML = `
      <div id="container"><blockquote><p>Quoted words here.</p>Attribution line</blockquote></div>
    `;
    const text = extractTextFromContainer(document.getElementById("container")!);
    expect(text).toBe("Quoted words here.\nAttribution line");
  });
});

describe("noise selector list", () => {
  beforeEach(() => {
    setNoiseSelector(DEFAULT_NOISE_SELECTORS);
  });

  afterEach(() => {
    setNoiseSelector(DEFAULT_NOISE_SELECTORS);
  });

  it("validates selectors without touching the page", () => {
    expect(isValidSelector(".promo")).toBe(true);
    expect(isValidSelector("header:not(article header)")).toBe(true);
    expect(isValidSelector("a[")).toBe(false);
    expect(isValidSelector("#123")).toBe(false);
    expect(isValidSelector("   ")).toBe(false);
  });

  it("drops invalid entries instead of breaking every matches() call", () => {
    setNoiseSelector([".promo", "a[", "#:r1:"]);
    document.body.innerHTML = `<div id="box"><span class="promo">Buy now</span><p>${sentences("kept", 1)}</p></div>`;
    const text = extractTextFromContainer(document.getElementById("box")!);
    expect(text).toContain("kept sentence 0");
    expect(text).not.toContain("Buy now");
  });

  it("treats an empty list as no noise", () => {
    setNoiseSelector([]);
    document.body.innerHTML = `<div id="box"><nav><p>Menu entry</p></nav><p>Body text</p></div>`;
    expect(extractTextFromContainer(document.getElementById("box")!)).toContain("Menu entry");
  });

  it("keeps a page-wide consent banner out of the <p> fallback", () => {
    document.body.innerHTML = `
      <div id="onetrust-consent-sdk"><p>We use cookies to improve your experience on our website and for marketing.</p></div>
      <div class="cookie-banner"><p>By continuing to browse you agree to our use of cookies and similar tech.</p></div>
    `;
    expect(detectMainContentWithRoot()).toBeNull();
  });

  it("reads a page wrapped in a <form> (ASP.NET WebForms)", () => {
    document.body.innerHTML = `<form id="aspnetForm"><div id="content">${paragraphs("webforms", 4)}</div></form>`;
    expect(detectMainContentWithRoot()?.text).toContain("webforms 0 sentence 0");
  });
});
