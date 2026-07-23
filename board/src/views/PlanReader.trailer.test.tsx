// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import PlanReader from "./PlanReader";
import type { BoardData } from "../lib/types";

afterEach(cleanup);

const SLUG = "01-workspace";
const DRAFT_PATH = `plans/execution/${SLUG}/.draft-v1.md`;
const SNAP_PATH = `plans/execution/${SLUG}/v1-draft-1.md`;

function plan(step: string): string {
  return [
    "# Workspace setup — Execution Plan v1",
    "",
    `Component: \`${SLUG}\` · Master plan: [MP](../../master-plan.md) · Date: 2026-07-22`,
    "",
    "## Build steps",
    "",
    `1. ${step}`,
  ].join("\n");
}

// A working draft (v1) with one committed iteration (v1·d1) behind it — the
// state the reopen-on-draft flow lands the board in, where the diff toggle
// auto-enables against the previous iteration.
function data(): BoardData {
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-22T00:00",
    mode: "static",
    focus: null,
    detailLevel: "standard",
    project: { name: "p" },
    git: { available: false },
    files: {
      masterPlan: { path: "plans/master-plan.md", content: "# MP" },
      decisionLog: { path: "plans/decision-log.md", content: "# DL" },
      executionPlans: [
        {
          component: SLUG,
          versions: [],
          draftSnapshots: [
            { version: 1, iteration: 1, path: SNAP_PATH, content: plan("Do the thing.") },
          ],
          draft: {
            proposedVersion: 1,
            path: DRAFT_PATH,
            content: plan("Do the thing (revised in the draft)."),
          },
        },
      ],
      reviews: [],
    },
  } as unknown as BoardData;
}

function draw() {
  return render(
    <PlanReader
      data={data()}
      canAnnotate={false}
      selectedComponent={SLUG}
      annotations={[]}
      onAddPlanComment={() => {}}
      onPaintResult={() => {}}
      onOpenResults={() => {}}
    />,
  );
}

describe("PlanReader sign-off hint", () => {
  it("keeps the pending sign-off hint visible when a draft auto-opens its diff", async () => {
    draw();

    // The working draft lands with its diff against v1·d1 auto-enabled.
    await waitFor(() => {
      const box = screen.getByRole("checkbox", { name: /Diff vs/ }) as HTMLInputElement;
      expect(box.checked).toBe(true);
    });

    // The only guidance on how to approve an unsigned draft must survive the
    // diff view — otherwise the reopen-on-draft landing state shows no path
    // forward at all.
    expect(screen.getByText(/pending — signs at \/execute or \/sign/)).toBeTruthy();
  });
});
