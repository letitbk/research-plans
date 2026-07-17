// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import type { BoardData } from "./lib/types";

Element.prototype.scrollIntoView = vi.fn();
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })),
});

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

const V1 = [
  "# Execution Plan v1",
  "Component: `01-alpha`",
  "## Goal and success criteria",
  "goal text",
  "## Build steps",
  "step one",
].join("\n");

function gateFixture(): BoardData {
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-16T00:00",
    mode: "live",
    focus: null,
    projectId: "proj-1",
    bootId: "boot-a",
    boardToken: "tok-abc",
    gate: { component: "01-alpha", proposedVersion: 1 },
    project: { name: "p" },
    git: { available: false },
    files: {
      masterPlan: { path: "plans/master-plan.md", content: "# MP" },
      decisionLog: { path: "plans/decision-log.md", content: "# DL" },
      executionPlans: [
        {
          component: "01-alpha",
          versions: [],
          draft: {
            path: "plans/execution/01-alpha/.gate-v1.md",
            content: V1,
            proposedVersion: 1,
          },
        },
      ],
      reviews: [],
    },
  } as unknown as BoardData;
}

describe("failed gate POST recovery", () => {
  it("shows the gate-expired copy when the server is gone", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/api/approve")) {
        return { ok: false, status: 403, json: async () => ({ error: "bad-token" }) };
      }
      throw new TypeError("fetch failed");
    }));
    render(<App data={gateFixture()} />);
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    await waitFor(() => {
      expect(screen.getByText(/This sign-off gate has ended/i)).toBeTruthy();
    });
  });
});
