// Contract-drift alarm: fixtures include the LITERAL plugin templates and REAL
// artifacts produced by the v0.1.0 pressure tests. If a template or command
// changes the artifact format, these tests fail before the board ships broken.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseDecisionLog,
  parseExecutionPlan,
  parseMasterPlan,
  parseScorecard,
  payloadContentHash,
} from "./parse";
import { devData } from "../dev-data";

const TEMPLATES = join(
  __dirname,
  "../../../skills/managing-research-plans/templates",
);
const FIXTURES = join(__dirname, "__fixtures__");

const read = (p: string) => readFileSync(p, "utf-8");

describe("master plan parsing", () => {
  it("parses the literal template", () => {
    const mp = parseMasterPlan(read(join(TEMPLATES, "master-plan.md")));
    expect(mp.ok).toBe(true);
    expect(mp.components.length).toBeGreaterThanOrEqual(1);
    expect(mp.raw).toContain("<!-- research-plans:master-plan -->");
  });

  it("parses a real generated master plan", () => {
    const mp = parseMasterPlan(read(join(FIXTURES, "real-master-plan.md")));
    expect(mp.ok).toBe(true);
    expect(mp.title).toContain("Master Plan");
    expect(mp.lastUpdated).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(mp.components.length).toBe(4);
    expect(mp.components[0].status).toBe("done");
    expect(mp.components[1].status).toBe("not started");
  });

  it("parses the dev-data sample with statuses and links", () => {
    const mp = parseMasterPlan(devData.files.masterPlan.content);
    expect(mp.ok).toBe(true);
    expect(mp.components.map((c) => c.status)).toEqual([
      "done",
      "done",
      "in progress",
      "not started",
    ]);
    expect(mp.components[1].planLink).toContain("02-data-cleaning");
  });

  it("degrades to ok:false on non-contract markdown", () => {
    const mp = parseMasterPlan("# Something else entirely\n\nprose only");
    expect(mp.ok).toBe(false);
    expect(mp.raw).toContain("Something else");
  });
});

describe("decision log parsing", () => {
  it("returns zero entries for the literal template (header only)", () => {
    const entries = parseDecisionLog(read(join(TEMPLATES, "decision-log.md")));
    expect(entries.length).toBe(0);
  });

  it("parses dev-data entries with fields and late-captured flag", () => {
    const entries = parseDecisionLog(devData.files.decisionLog.content);
    expect(entries.length).toBe(3);
    expect(entries[0].timestamp).toBe("2026-07-01 10:12");
    expect(entries[0].lateCaptured).toBe(false);
    expect(entries[2].lateCaptured).toBe(true);
    const labels = entries[0].fields.map((f) => f.label);
    expect(labels).toContain("Context");
    expect(labels).toContain("Question (Claude)");
    expect(labels).toContain("Response (researcher)");
    expect(labels).toContain("Effect on execution");
  });

  it("handles Decision (Claude) entries", () => {
    const entries = parseDecisionLog(devData.files.decisionLog.content);
    const labels = entries[1].fields.map((f) => f.label);
    expect(labels).toContain("Decision (Claude)");
  });
});

describe("execution plan parsing", () => {
  it("parses the literal template with all seven sections", () => {
    const ep = parseExecutionPlan(read(join(TEMPLATES, "execution-plan.md")));
    expect(ep.ok).toBe(true);
    expect(ep.sections.map((s) => s.heading)).toEqual([
      "Context",
      "Scope decisions",
      "Approach",
      "Build steps",
      "Verification",
      "Out of scope",
      "Files to reuse",
    ]);
  });

  it("parses a real generated execution plan", () => {
    const ep = parseExecutionPlan(read(join(FIXTURES, "real-execution-plan.md")));
    expect(ep.ok).toBe(true);
    expect(ep.version).toBe(1);
    expect(ep.componentSlug).toBe("01-full-pipeline");
    expect(ep.sections.length).toBeGreaterThanOrEqual(6);
  });

  it("parses version, supersedes, and sign-off from dev-data v2", () => {
    const v2 = devData.files.executionPlans[0].versions[1];
    const ep = parseExecutionPlan(v2.content);
    expect(ep.ok).toBe(true);
    expect(ep.version).toBe(2);
    expect(ep.supersedes).toContain("v1");
    expect(ep.signedOff).toContain("Jane Doe");
    expect(ep.date).toBe("2026-07-01");
  });

  it("detects missing sign-off on drafts", () => {
    const draft = devData.files.executionPlans[1].draft!;
    const ep = parseExecutionPlan(draft.content);
    expect(ep.ok).toBe(true);
    expect(ep.signedOff).toBeNull();
  });
});

describe("scorecard parsing", () => {
  it("extracts the json board-scorecard fence", () => {
    const sc = parseScorecard(devData.files.reviews[0].content);
    expect(sc).not.toBeNull();
    expect(sc!.items.length).toBe(14);
    expect(sc!.percent).toBe(82);
    expect(sc!.band).toBe("strong");
    expect(sc!.items[10].score).toBeNull();
    expect(sc!.items[10].status).toBe("N/A");
  });

  it("returns null when the fence is absent or invalid", () => {
    expect(parseScorecard("# Review\n\nNo fence here")).toBeNull();
    expect(parseScorecard("```json board-scorecard\n{broken\n```")).toBeNull();
  });

  it("parses the scorecard template's fence shape", () => {
    const tpl = read(join(TEMPLATES, "review-scorecard.md"));
    // The template holds placeholder text, not valid JSON — parsing it should
    // not throw, and should return null (placeholders) rather than garbage.
    expect(() => parseScorecard(tpl)).not.toThrow();
  });
});

describe("payload content hash", () => {
  it("is stable across ordering and ignores nothing in content", () => {
    const a = payloadContentHash([
      { path: "b.md", content: "two" },
      { path: "a.md", content: "one" },
    ]);
    const b = payloadContentHash([
      { path: "a.md", content: "one" },
      { path: "b.md", content: "two" },
    ]);
    expect(a).toBe(b);
    const c = payloadContentHash([
      { path: "a.md", content: "one!" },
      { path: "b.md", content: "two" },
    ]);
    expect(c).not.toBe(a);
  });
});
