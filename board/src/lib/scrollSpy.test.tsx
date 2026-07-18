// @vitest-environment jsdom
// The spy computes from live geometry on scroll ticks (see scrollSpy.ts for
// why IntersectionObserver was abandoned: threshold crossings never fire on a
// jump-scroll) — tests mock getBoundingClientRect per heading and dispatch
// window scroll events.
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useScrollSpy } from "./scrollSpy";

function rect(top: number): DOMRect {
  return {
    top, bottom: top + 30, left: 0, right: 100, width: 100, height: 30,
    x: 0, y: top, toJSON: () => ({}),
  } as DOMRect;
}

function makeHost(headings: Array<{ id: string; top: number }>) {
  const host = document.createElement("div");
  for (const h of headings) {
    const el = document.createElement("h2");
    el.setAttribute("data-outline-id", h.id);
    el.getBoundingClientRect = () => rect(h.top);
    host.appendChild(el);
  }
  document.body.appendChild(host);
  return host;
}

function setTop(host: HTMLElement, id: string, top: number) {
  const el = host.querySelector(`[data-outline-id="${id}"]`) as HTMLElement;
  el.getBoundingClientRect = () => rect(top);
}

function hostRef(host: HTMLElement) {
  const ref = createRef<HTMLElement>();
  (ref as { current: HTMLElement }).current = host;
  return ref;
}

async function scrollTick() {
  await act(async () => {
    window.dispatchEvent(new Event("scroll"));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 1000 });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("useScrollSpy", () => {
  it("reports the last heading whose top rose above the reading band", async () => {
    const host = makeHost([{ id: "A", top: 500 }, { id: "B", top: 900 }]);
    const { result } = renderHook(() =>
      useScrollSpy(hostRef(host), "[data-outline-id]", ["doc1"]));
    expect(result.current).toBeNull(); // nothing above the 300px band yet

    setTop(host, "A", -100); // scrolled past A
    await scrollTick();
    expect(result.current?.getAttribute("data-outline-id")).toBe("A");

    setTop(host, "B", 100); // B now inside the band
    await scrollTick();
    expect(result.current?.getAttribute("data-outline-id")).toBe("B");
  });

  it("handles a jump-scroll past everything (the IntersectionObserver failure case)", async () => {
    const host = makeHost([{ id: "A", top: 500 }, { id: "B", top: 2000 }]);
    const { result } = renderHook(() =>
      useScrollSpy(hostRef(host), "[data-outline-id]", ["doc1"]));
    // One giant jump: both headings teleport far above the viewport between
    // two frames — the case where IO's threshold crossings never fire.
    setTop(host, "A", -1600);
    setTop(host, "B", -100);
    await scrollTick();
    expect(result.current?.getAttribute("data-outline-id")).toBe("B");
  });

  it("moves back up when scrolling toward the top", async () => {
    const host = makeHost([{ id: "A", top: -500 }, { id: "B", top: -100 }]);
    const { result } = renderHook(() =>
      useScrollSpy(hostRef(host), "[data-outline-id]", ["doc1"]));
    await scrollTick();
    expect(result.current?.getAttribute("data-outline-id")).toBe("B");
    setTop(host, "A", 500);
    setTop(host, "B", 900);
    await scrollTick();
    expect(result.current).toBeNull();
  });

  it("resets to null when deps change (document switch)", async () => {
    const host = makeHost([{ id: "A", top: -100 }]);
    const ref = hostRef(host);
    const { result, rerender } = renderHook(
      ({ dep }) => useScrollSpy(ref, "[data-outline-id]", [dep]),
      { initialProps: { dep: "doc1" } },
    );
    await scrollTick();
    expect(result.current).not.toBeNull();
    host.innerHTML = ""; // the new document has no headings yet
    rerender({ dep: "doc2" });
    expect(result.current).toBeNull();
  });

  it("only considers elements matching the selector", async () => {
    const host = makeHost([{ id: "A", top: -100 }]);
    const h3 = document.createElement("h3"); // no data-outline-id — must be ignored
    h3.getBoundingClientRect = () => rect(-50);
    host.appendChild(h3);
    const { result } = renderHook(() =>
      useScrollSpy(hostRef(host), "[data-outline-id]", ["doc1"]));
    await scrollTick();
    expect(result.current?.getAttribute("data-outline-id")).toBe("A");
  });

  it("removes its listeners on unmount", () => {
    const host = makeHost([{ id: "A", top: 500 }]);
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() =>
      useScrollSpy(hostRef(host), "[data-outline-id]", ["doc1"]));
    unmount();
    const removed = removeSpy.mock.calls.map((c) => c[0]);
    expect(removed).toContain("scroll");
    expect(removed).toContain("resize");
  });
});
