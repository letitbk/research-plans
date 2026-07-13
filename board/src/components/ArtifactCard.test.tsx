// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ArtifactCard from "./ArtifactCard";
import type { ResultArtifact, ResultsBundle } from "../lib/types";

afterEach(cleanup);

function art(over: Partial<ResultArtifact>): ResultArtifact {
  return {
    id: "a1", kind: "data", title: "T", caption: "", tex: null, data: null,
    file: "artifacts/notes.md", producedBy: null,
    source: { path: "o/x", sha256: "0".repeat(64), bytes: 1, oversized: false },
    ...over,
  } as ResultArtifact;
}
function bundle(assets: Record<string, string>): ResultsBundle {
  return {
    dir: "plans/execution/01-x/results/r1", resultsVersion: 1,
    scripts: [], assets,
  } as unknown as ResultsBundle;
}
const base = { openScript: null, setOpenScript: () => {} };

describe("ArtifactCard view/anchor policy", () => {
  it("renders a view button for viewable files when onView is provided", () => {
    const onView = vi.fn();
    render(
      <ArtifactCard {...base} art={art({})} onView={onView}
        bundle={bundle({ "notes.md": "/artifact/01-x/r1/notes.md" })} />,
    );
    fireEvent.click(screen.getByText("view notes.md"));
    expect(onView).toHaveBeenCalledWith({
      url: "/artifact/01-x/r1/notes.md", kind: "md", title: "T", basename: "notes.md",
    });
  });
  it("falls back to a download anchor without onView", () => {
    render(
      <ArtifactCard {...base} art={art({})}
        bundle={bundle({ "notes.md": "data:text/markdown;base64,QQ==" })} />,
    );
    const a = screen.getByText("open notes.md");
    expect(a.hasAttribute("download")).toBe(true);
  });
  it("live pdf: anchor without download, opens new tab", () => {
    render(
      <ArtifactCard {...base} art={art({ file: "artifacts/doc.pdf" })}
        bundle={bundle({ "doc.pdf": "/artifact/01-x/r1/doc.pdf" })} />,
    );
    const a = screen.getByText("open doc.pdf");
    expect(a.hasAttribute("download")).toBe(false);
    expect(a.getAttribute("target")).toBe("_blank");
  });
  it("live html: anchor KEEPS download (active content never navigates)", () => {
    render(
      <ArtifactCard {...base} art={art({ file: "artifacts/page.html" })}
        bundle={bundle({ "page.html": "/artifact/01-x/r1/page.html" })} />,
    );
    expect(screen.getByText("open page.html").hasAttribute("download")).toBe(true);
  });
  it("data-file link becomes a view button when viewable", () => {
    const onView = vi.fn();
    render(
      <ArtifactCard {...base} onView={onView}
        art={art({ kind: "table", file: "artifacts/t.png", data: "artifacts/t.csv" })}
        bundle={bundle({ "t.png": "/artifact/01-x/r1/t.png", "t.csv": "/artifact/01-x/r1/t.csv" })} />,
    );
    fireEvent.click(screen.getByText("data: t.csv"));
    expect(onView).toHaveBeenCalledWith({
      url: "/artifact/01-x/r1/t.csv", kind: "csv", title: "T", basename: "t.csv",
    });
  });
});
