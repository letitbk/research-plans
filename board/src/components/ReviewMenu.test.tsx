// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ReviewMenu from "./ReviewMenu";

afterEach(cleanup);

describe("ReviewMenu dismissal", () => {
  it("closes on Escape and outside clicks", () => {
    render(<ReviewMenu onPick={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: /Review with/ });

    fireEvent.click(trigger);
    expect(screen.queryByRole("menu")).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("does not dismiss for clicks inside the menu", () => {
    render(<ReviewMenu onPick={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Review with/ }));
    fireEvent.mouseDown(screen.getByRole("menu"));
    expect(screen.queryByRole("menu")).not.toBeNull();
  });
});
