// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render } from "@testing-library/react";
import Markdown from "./Markdown";

afterEach(cleanup);

const html = (source: string) =>
  render(<Markdown source={source} />).container.innerHTML;

describe("Markdown link scheme allowlist", () => {
  it("renders https links as anchors with noopener noreferrer", () => {
    const out = html("[site](https://example.com)");
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
  });
  it("renders mailto and fragment links", () => {
    expect(html("[m](mailto:a@b.c)")).toContain('href="mailto:a@b.c"');
    const frag = html("[top](#top)");
    expect(frag).toContain('href="#top"');
    expect(frag).not.toContain("target=");
  });
  it("drops javascript: links to plain text", () => {
    const out = html("[click](javascript:alert(1))");
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("<a");
    expect(out).toContain("click");
  });
  it("drops data: and file: and relative links to plain text", () => {
    expect(html("[d](data:text/html,x)")).not.toContain("<a");
    expect(html("[f](file:///etc/passwd)")).not.toContain("<a");
    expect(html("[r](artifacts/table.csv)")).not.toContain("<a");
  });
  it("keeps inline formatting inside a dropped link", () => {
    expect(html("[**bold** claim](javascript:x)")).toContain("<strong>bold</strong>");
  });
  it("escapes quotes in allowed hrefs", () => {
    const out = html("[t](https://e.com/?q=%22x%22)");
    expect(out).toContain("<a");
    // the href value must not terminate early on an embedded quote
    const href = /href="([^"]*)"/.exec(out)?.[1] ?? "";
    expect(href.startsWith("https://e.com/")).toBe(true);
  });
});
