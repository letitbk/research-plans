// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import PlanReader from "./PlanReader";
import type { BoardData, PlanCommentAnnotation } from "../lib/types";

afterEach(cleanup);

const PLAN_PATH = "plans/execution/01-steps/v1.md";

const PLAN = [
  "# Step cards — Execution Plan v1",
  "",
  "Component: `01-steps` · Master plan: [Master plan](../../master-plan.md) · Date: 2026-07-18",
  "",
  "## Build steps",
  "Intro before the cards.",
  "",
  "1. Step through the data with [docs][ref].",
  "2. Transform the records.",
  "",
  "   Second paragraph stays in the card.",
  "",
  "   - Nested bullet stays nested.",
  "",
  "   ```js",
  "   const rows = [];",
  "   ```",
  "3. Inspect the generated file.",
  "",
  "   <details class=\"agent-detail\"><summary>Agent detail — exact command</summary>",
  "",
  "   Run the exact command.",
  "",
  "   </details>",
  "4. [x] Verify output.",
  "",
  "Paragraph between the lists.",
  "",
  "1. Later ordered item.",
  "2. Another later item.",
  "",
  "Tail after the later list.",
  "",
  "[ref]: https://example.com/docs",
].join("\n");

function data(content: string): BoardData {
  return {
    schemaVersion: 1,
    generatedAt: "2026-07-18T00:00",
    mode: "static",
    focus: null,
    detailLevel: "standard",
    project: { name: "p" },
    git: { available: false },
    files: {
      masterPlan: { path: "plans/master-plan.md", content: "# MP" },
      decisionLog: { path: "plans/decision-log.md", content: "# DL" },
      executionPlans: [{
        component: "01-steps",
        versions: [{ version: 1, path: PLAN_PATH, content }],
      }],
      reviews: [],
    },
  } as unknown as BoardData;
}

function annotation(
  id: string,
  quote: string,
  occurrenceIndex = 0,
): PlanCommentAnnotation {
  return {
    id,
    type: "plan-comment",
    planPath: PLAN_PATH,
    component: "01-steps",
    version: 1,
    isDraft: false,
    quote,
    prefix: "",
    suffix: "",
    sectionHeading: "Build steps",
    occurrenceIndex,
    anchored: true,
    comment: "Review note",
  };
}

function draw(
  content = PLAN,
  annotations: PlanCommentAnnotation[] = [],
) {
  return render(
    <PlanReader
      data={data(content)}
      canAnnotate={annotations.length > 0}
      selectedComponent="01-steps"
      annotations={annotations}
      onAddPlanComment={() => {}}
      onPaintResult={() => {}}
      onOpenResults={() => {}}
    />,
  );
}

describe("PlanReader Build step cards", () => {
  it("renders each Build step as a numbered card with Step N of M", () => {
    draw();

    for (let i = 1; i <= 4; i += 1) {
      expect(screen.getByText(`Step ${i} of 4`)).toBeTruthy();
    }
  });

  it("renders the cards as an ordered list with four top-level list items", () => {
    const { container } = draw();
    const list = screen.getByText("Step 1 of 4").closest("ol");

    expect(list).toBeTruthy();
    expect(list?.tagName).toBe("OL");
    expect(list?.classList.contains("list-none")).toBe(true);
    expect(container.querySelectorAll("ol.list-none > li")).toHaveLength(4);
  });

  it("keeps nested lists, paragraphs, and fenced code inside their card", () => {
    draw();
    const card = screen.getByText("Step 2 of 4").closest("li");

    expect(card?.textContent).toContain("Second paragraph stays in the card.");
    expect(card?.querySelector("ul li")?.textContent).toContain("Nested bullet stays nested.");
    expect(card?.querySelector("pre code")?.textContent).toContain("const rows = [];");
  });

  it("keeps agent detail inside a step as a disclosure button", () => {
    const { container } = draw();

    expect(screen.getByRole("button", { name: "Agent detail — exact command" })).toBeTruthy();
    expect(screen.getByText("Run the exact command.").closest("li")?.textContent).toContain("Step 3 of 4");
    expect(container.querySelector("details")).toBeNull();
  });

  it("renders a task step's checked state in the card chrome", () => {
    draw();
    const checkbox = screen.getByRole("checkbox", { checked: true });

    expect(checkbox).toBeTruthy();
    expect(checkbox.closest("li")?.textContent).toContain("Step 4 of 4");
  });

  it("resolves reference-style links across the item boundary", () => {
    draw();

    expect(screen.getByRole("link", { name: "docs" }).getAttribute("href")).toBe(
      "https://example.com/docs",
    );
  });

  it("turns only the first ordered list into cards", () => {
    draw();
    const laterItem = screen.getByText("Later ordered item.").closest("li");

    expect(laterItem?.closest("ol")?.classList.contains("list-none")).toBe(false);
    expect(laterItem?.textContent).not.toContain("Step");
  });

  it("renders content before and after the first list normally", () => {
    draw();

    expect(screen.getByText("Intro before the cards.")).toBeTruthy();
    expect(screen.getByText("Paragraph between the lists.")).toBeTruthy();
    expect(screen.getByText("Tail after the later list.")).toBeTruthy();
  });

  it("recognizes Build steps in a CRLF plan", () => {
    draw(PLAN.replace(/\n/g, "\r\n"));

    expect(screen.getByText("Step 1 of 4")).toBeTruthy();
    expect(screen.getByText("Step 4 of 4")).toBeTruthy();
  });

  it("falls back to the normal body renderer when Build steps has no ordered list", () => {
    const noList = [
      "# Unnumbered — Execution Plan v1",
      "",
      "## Build steps",
      "Unnumbered build guidance stays normal.",
    ].join("\n");
    draw(noList);

    expect(screen.getByText("Unnumbered build guidance stays normal.")).toBeTruthy();
    expect(screen.queryByText(/Step 1 of/)).toBeNull();
  });

  it("keeps an annotation inside step 2 paintable", async () => {
    const { container } = draw(PLAN, [annotation("step-two", "Second paragraph stays in the card.")]);

    await waitFor(() => {
      expect(container.querySelector('mark[data-annotation="step-two"]')?.textContent).toBe(
        "Second paragraph stays in the card.",
      );
    });
  });

  it("does not let card labels steal a body quote containing the word Step", async () => {
    const { container } = draw(PLAN, [annotation("step-word", "Step through the data")]);

    await waitFor(() => {
      expect(container.querySelector('mark[data-annotation="step-word"]')?.textContent).toBe(
        "Step through the data",
      );
    });
    expect(container.querySelector('mark[data-annotation="step-word"]')?.closest("p")?.textContent).toContain(
      "with docs",
    );
  });
});
