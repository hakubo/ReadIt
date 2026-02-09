import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { SettingsPanel } from "../content/SettingsPanel";

afterEach(cleanup);

// Mock settings module - factory must not reference outer scope variables
vi.mock("../shared/settings", () => {
  return {
    getGlobalSettings: vi.fn().mockResolvedValue({
      voices: ["af_heart"],
      speed: 1,
      highlightSentences: true,
      highlightColor: "rgba(254, 240, 138, 0.55)",
      autoScroll: true,
      theme: "dark",
      textReplacements: [
        { pattern: "\\be\\.g\\.\\s*", replacement: "for example, ", flags: "gi", enabled: true },
      ],
      noiseSelectors: ["nav", "footer"],
    }),
    getDomainSettings: vi.fn().mockResolvedValue(null),
    saveGlobalSettings: vi.fn().mockResolvedValue(undefined),
    saveDomainSettings: vi.fn().mockResolvedValue(undefined),
    clearDomainSettings: vi.fn().mockResolvedValue(undefined),
  };
});

// Mock voices to keep tests small
vi.mock("../lib/resources", () => ({
  voices: [
    { id: "af_heart", name: "Heart", gender: "Female", lang: { name: "English (US)", code: "en-us" } },
    { id: "am_adam", name: "Adam", gender: "Male", lang: { name: "English (US)", code: "en-us" } },
    { id: "bf_emma", name: "Emma", gender: "Female", lang: { name: "English (UK)", code: "en-gb" } },
  ],
}));

const defaultProps = {
  position: { x: 100, y: 100 },
  onClose: vi.fn(),
  domain: "example.com",
  theme: "dark" as const,
  visible: true,
  onPickContent: vi.fn(),
  contentSelector: undefined as string | undefined,
  onClearContentSelector: vi.fn(),
  onSetContentSelector: vi.fn(),
  onSelectorFocus: vi.fn(),
  onSelectorBlur: vi.fn(),
};

describe("SettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chrome mock responses
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(
      ((...args: unknown[]) => {
        const callback = args.find((a) => typeof a === "function") as
          | ((response: unknown) => void)
          | undefined;
        if (callback) {
          callback({ modelCached: true, cachedVoices: [] });
        }
        return undefined as never;
      }) as typeof chrome.runtime.sendMessage,
    );
  });

  it("renders the settings title", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders Default and domain tabs", () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getByText("example.com")).toBeInTheDocument();
  });

  it("shows voice list after loading", async () => {
    render(<SettingsPanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Heart \(Female\)/)).toBeInTheDocument();
      expect(screen.getByText(/Adam \(Male\)/)).toBeInTheDocument();
    });
  });

  it("groups voices by language", async () => {
    render(<SettingsPanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("English (US)")).toBeInTheDocument();
      expect(screen.getByText("English (UK)")).toBeInTheDocument();
    });
  });

  it("shows speed label", async () => {
    render(<SettingsPanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Speed: 1.0x")).toBeInTheDocument();
    });
  });

  it("shows highlight toggle", async () => {
    render(<SettingsPanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Highlight sentences")).toBeInTheDocument();
    });
  });

  it("shows dark mode toggle", async () => {
    render(<SettingsPanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("Dark mode")).toBeInTheDocument();
    });
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(
      <SettingsPanel {...defaultProps} onClose={onClose} />,
    );
    fireEvent.click(container.querySelector(".settings-close-btn")!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("hides when visible is false", () => {
    const { container } = render(
      <SettingsPanel {...defaultProps} visible={false} />,
    );
    const panel = container.querySelector(".settings-panel");
    expect(panel).toBeInTheDocument();
    expect(panel?.className).not.toContain("visible");
  });

  it("shows when visible is true", () => {
    const { container } = render(
      <SettingsPanel {...defaultProps} visible={true} />,
    );
    const panel = container.querySelector(".settings-panel");
    expect(panel?.className).toContain("visible");
  });

  it("shows text rules section", async () => {
    render(<SettingsPanel {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText(/Text rules/)).toBeInTheDocument();
    });
  });

  it("expands text rules when clicked", async () => {
    render(<SettingsPanel {...defaultProps} />);
    await waitFor(() => {
      fireEvent.click(screen.getByText(/Text rules/));
    });
    expect(screen.getByText("+ Add rule")).toBeInTheDocument();
    expect(screen.getByText("Reset to defaults")).toBeInTheDocument();
  });

  it("applies theme-light class for light theme", () => {
    const { container } = render(
      <SettingsPanel {...defaultProps} theme="light" />,
    );
    const panel = container.querySelector(".settings-panel");
    expect(panel?.className).toContain("theme-light");
  });

  it("shows content area section on domain tab", async () => {
    render(<SettingsPanel {...defaultProps} />);
    fireEvent.click(screen.getByText("example.com"));
    await waitFor(() => {
      expect(screen.getByText("Content area")).toBeInTheDocument();
    });
  });

  it("truncates long domain names", () => {
    const { container } = render(
      <SettingsPanel
        {...defaultProps}
        domain="www.this-is-a-very-long-domain-name-that-should-be-truncated.com"
      />,
    );
    const domainTab = container.querySelector(".tab-domain");
    expect(domainTab?.textContent).toContain("\u2026");
  });
});
