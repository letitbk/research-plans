// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ViewerModal from "./ViewerModal";
import type { ViewerRequest } from "../lib/artifactDisplay";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const b64 = (s: string) => Buffer.from(s, "utf-8").toString("base64");
const req = (over: Partial<ViewerRequest>): ViewerRequest => ({
  url: "data:text/plain;base64," + b64("hello"),
  kind: "text", title: "Artifact", basename: "a.txt", ...over,
});
const noop = () => {};

describe("ViewerModal", () => {
  it("renders markdown through the Markdown component with assets resolved", async () => {
    const md = "# Heading\n\n![fig](artifacts/fig1.png)";
    render(
      <ViewerModal
        request={req({ url: "data:text/markdown;base64," + b64(md), kind: "md", basename: "r.md" })}
        assets={{ "fig1.png": "data:image/png;base64,AAAA" }}
        onClose={noop}
      />,
    );
    expect(await screen.findByText("Heading")).toBeTruthy();
    const img = document.querySelector("img");
    expect(img?.getAttribute("src")).toBe("data:image/png;base64,AAAA");
  });
  it("renders csv as a table and shows truncation notices when capped", async () => {
    const rows = ["h1,h2", ...Array.from({ length: 501 }, (_, i) => `${i},x`)].join("\n");
    render(
      <ViewerModal
        request={req({ url: "data:text/csv;base64," + b64(rows), kind: "csv", basename: "t.csv" })}
        assets={{}}
        onClose={noop}
      />,
    );
    expect(await screen.findByText("h1")).toBeTruthy();
    expect(screen.getByText(/showing first 500 of 502 rows/)).toBeTruthy();
  });
  it("renders plain text in a pre", async () => {
    render(<ViewerModal request={req({})} assets={{}} onClose={noop} />);
    const pre = await screen.findByText("hello");
    expect(pre.closest("pre")).toBeTruthy();
  });
  it("shows the oversized fallback with the escape-hatch link", async () => {
    const url = "data:text/csv;base64," + "A".repeat(4 * 1024 * 1024);
    render(<ViewerModal request={req({ url, kind: "csv" })} assets={{}} onClose={noop} />);
    expect(await screen.findByText(/too large to display here/)).toBeTruthy();
  });
  it("shows an error state for failed fetches, not the body", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("secret", { status: 404 })));
    render(<ViewerModal request={req({ url: "/artifact/x/r1/a.txt" })} assets={{}} onClose={noop} />);
    expect(await screen.findByText(/could not load/i)).toBeTruthy();
    expect(screen.queryByText("secret")).toBeNull();
  });
  it("aborts the in-flight fetch on unmount", async () => {
    let captured: AbortSignal | undefined;
    vi.stubGlobal("fetch", (_u: string, init?: RequestInit) => {
      captured = (init?.signal ?? undefined) as AbortSignal | undefined;
      return new Promise<Response>(() => {});
    });
    const { unmount } = render(
      <ViewerModal request={req({ url: "/artifact/x/r1/a.txt" })} assets={{}} onClose={noop} />,
    );
    unmount();
    expect(captured?.aborted).toBe(true);
  });
  it("closes on scrim click and ✕ but NOT on panel click; Escape closes", async () => {
    const onClose = vi.fn();
    render(<ViewerModal request={req({})} assets={{}} onClose={onClose} />);
    await screen.findByText("hello");
    fireEvent.click(screen.getByText("hello")); // inside panel
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("dialog")); // scrim
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByLabelText("Close viewer"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
  it("live URLs get an open-raw footer link; data: URLs get download", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("x", { status: 200 })));
    const { unmount } = render(
      <ViewerModal request={req({ url: "/artifact/x/r1/a.txt" })} assets={{}} onClose={noop} />,
    );
    expect((await screen.findByText(/open raw/)).getAttribute("target")).toBe("_blank");
    unmount();
    render(<ViewerModal request={req({})} assets={{}} onClose={noop} />);
    expect((await screen.findByText("download")).hasAttribute("download")).toBe(true);
  });
  it("moves focus to the close button on open", async () => {
    render(<ViewerModal request={req({})} assets={{}} onClose={noop} />);
    await screen.findByText("hello");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close viewer");
  });
});
