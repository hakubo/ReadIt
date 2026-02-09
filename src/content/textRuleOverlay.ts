// Text rule overlay: highlights regex matches on the page and provides
// a text picker for creating rules from selected page text.

const MAX_MATCHES = 100;
const MAX_TOOLTIPS = 8;

/** Escape a string so it can be used as a literal regex pattern. */
export function escapeForRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Describes a single regex match found in a text node. */
export interface TextMatch {
  range: Range;
  matched: string;
  replaced: string;
}

/**
 * Walk visible text nodes under `root` and find regex matches.
 * Returns an array of { range, matched, replaced } objects.
 */
export function findTextMatches(
  pattern: string,
  flags: string,
  replacement: string,
  root: Element = document.body,
): TextMatch[] {
  if (!pattern) {
    return [];
  }

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, flags || "gi");
  } catch {
    return [];
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node) {
      const parent = node.parentElement;
      if (!parent) {
        return NodeFilter.FILTER_REJECT;
      }
      if (
        parent.closest(
          "script, style, noscript, #unmute-player, #unmute-selection-button",
        )
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      if (!node.textContent?.trim()) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const matches: TextMatch[] = [];
  let node: Node | null;

  while ((node = walker.nextNode())) {
    if (matches.length >= MAX_MATCHES) {
      break;
    }

    const text = node.textContent || "";
    regex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (matches.length >= MAX_MATCHES) {
        break;
      }

      const range = document.createRange();
      try {
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
      } catch {
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
        continue;
      }

      let replaced: string;
      try {
        replaced = match[0].replace(
          new RegExp(pattern, flags || "gi"),
          replacement,
        );
      } catch {
        replaced = match[0];
      }

      matches.push({ range, matched: match[0], replaced });

      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }
  }

  return matches;
}

export class TextRuleOverlay {
  private highlights: HTMLDivElement[] = [];
  private tooltips: HTMLDivElement[] = [];
  private pickerActive = false;
  private pickerBanner: HTMLDivElement | null = null;
  private pickerMouseUpHandler: ((e: MouseEvent) => void) | null = null;
  private pickerKeyDownHandler: ((e: KeyboardEvent) => void) | null = null;

  isPickerActive(): boolean {
    return this.pickerActive;
  }

  /**
   * Show overlay highlights for all text on the page matching a regex pattern.
   * Returns the number of matches found.
   */
  showRulePreview(
    pattern: string,
    flags: string,
    replacement: string,
    root?: Element,
  ): number {
    this.hideRulePreview();
    if (!pattern) {
      return 0;
    }

    const matches = findTextMatches(pattern, flags, replacement, root);
    if (matches.length === 0) {
      return 0;
    }

    let tooltipCount = 0;

    for (const { range, matched, replaced } of matches) {
      let rects: DOMRectList | DOMRect[];
      try {
        rects = range.getClientRects();
      } catch {
        continue;
      }

      for (const rect of rects) {
        if (rect.width === 0 || rect.height === 0) {
          continue;
        }

        const box = document.createElement("div");
        box.className = "unmute-text-rule-highlight";
        box.style.cssText = `
          position: absolute;
          left: ${rect.left + window.scrollX}px;
          top: ${rect.top + window.scrollY}px;
          width: ${rect.width}px;
          height: ${rect.height}px;
          background: rgba(59, 130, 246, 0.15);
          border: 1px solid rgba(59, 130, 246, 0.4);
          border-radius: 2px;
          pointer-events: none;
          z-index: 2147483645;
        `;
        document.documentElement.appendChild(box);
        this.highlights.push(box);
      }

      // Show replacement tooltip for a limited number of matches
      if (
        tooltipCount < MAX_TOOLTIPS &&
        rects.length > 0 &&
        matched !== replaced
      ) {
        const firstRect = rects[0];
        if (firstRect.width > 0 && firstRect.height > 0) {
          const tooltip = document.createElement("div");
          tooltip.className = "unmute-text-rule-tooltip";
          tooltip.style.cssText = `
            position: absolute;
            left: ${firstRect.left + window.scrollX}px;
            top: ${firstRect.bottom + window.scrollY + 2}px;
            background: #1f2937;
            color: #34d399;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-family: ui-monospace, monospace;
            white-space: nowrap;
            z-index: 2147483646;
            pointer-events: none;
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
          `;
          tooltip.textContent = `\u2192 ${replaced}`;
          document.documentElement.appendChild(tooltip);
          this.tooltips.push(tooltip);
          tooltipCount++;
        }
      }
    }

    return matches.length;
  }

  /** Remove all overlay highlights and tooltips. */
  hideRulePreview(): void {
    for (const h of this.highlights) {
      h.remove();
    }
    this.highlights = [];
    for (const t of this.tooltips) {
      t.remove();
    }
    this.tooltips = [];
  }

  /**
   * Enter text picker mode. The user selects text on the page,
   * and the selection is converted to an escaped regex pattern.
   */
  startTextPicker(
    onSelect: (pattern: string) => void,
    onCancel: () => void,
  ): void {
    if (this.pickerActive) {
      return;
    }
    this.pickerActive = true;

    // Show a small banner at the top of the page
    this.pickerBanner = document.createElement("div");
    this.pickerBanner.dataset.unmuteTextPicker = "true";
    this.pickerBanner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: #1e40af;
      color: white;
      text-align: center;
      padding: 8px 16px;
      font-size: 13px;
      font-family: system-ui, -apple-system, sans-serif;
      z-index: 2147483647;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    this.pickerBanner.textContent =
      "Select text on the page to create a text rule. Press Escape to cancel.";
    document.documentElement.appendChild(this.pickerBanner);

    this.pickerMouseUpHandler = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      if (text && text.length > 0) {
        const pattern = escapeForRegex(text);
        this.stopTextPicker();
        onSelect(pattern);
      }
    };

    this.pickerKeyDownHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        this.stopTextPicker();
        onCancel();
      }
    };

    // Delay listener attachment so the click that triggered the picker
    // doesn't immediately fire the mouseup handler
    setTimeout(() => {
      if (!this.pickerActive) {
        return;
      }
      document.addEventListener("mouseup", this.pickerMouseUpHandler!);
      document.addEventListener("keydown", this.pickerKeyDownHandler!);
    }, 100);
  }

  /** Exit text picker mode and remove the banner. */
  stopTextPicker(): void {
    if (!this.pickerActive) {
      return;
    }
    this.pickerActive = false;

    if (this.pickerBanner) {
      this.pickerBanner.remove();
      this.pickerBanner = null;
    }
    if (this.pickerMouseUpHandler) {
      document.removeEventListener("mouseup", this.pickerMouseUpHandler);
      this.pickerMouseUpHandler = null;
    }
    if (this.pickerKeyDownHandler) {
      document.removeEventListener("keydown", this.pickerKeyDownHandler);
      this.pickerKeyDownHandler = null;
    }
  }
}
