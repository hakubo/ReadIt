import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { SelectionButton } from "../content/SelectionButton";

afterEach(cleanup);

describe("SelectionButton", () => {
  const defaultProps = {
    position: { x: 100, y: 200 },
    onRead: vi.fn(),
    loading: false,
    theme: "dark" as const,
  };

  it("renders 'Read' text when not loading", () => {
    render(<SelectionButton {...defaultProps} />);
    expect(screen.getByText("Read")).toBeInTheDocument();
  });

  it("renders 'Loading...' when loading", () => {
    render(<SelectionButton {...defaultProps} loading={true} />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("calls onRead when clicked", () => {
    const onRead = vi.fn();
    render(<SelectionButton {...defaultProps} onRead={onRead} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onRead).toHaveBeenCalledOnce();
  });

  it("is disabled when loading", () => {
    render(<SelectionButton {...defaultProps} loading={true} />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("is not disabled when not loading", () => {
    render(<SelectionButton {...defaultProps} loading={false} />);
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("positions itself at the specified coordinates", () => {
    render(<SelectionButton {...defaultProps} position={{ x: 50, y: 75 }} />);
    const button = screen.getByRole("button");
    expect(button.style.left).toBe("50px");
    expect(button.style.top).toBe("75px");
  });

  it.each(["light", "dark"] as const)(
    "applies correct class for %s theme",
    (theme) => {
      const { container } = render(
        <SelectionButton {...defaultProps} theme={theme} />,
      );
      const button = container.querySelector("button")!;
      if (theme === "light") {
        expect(button.className).toContain("theme-light");
      } else {
        expect(button.className).not.toContain("theme-light");
      }
    },
  );
});
