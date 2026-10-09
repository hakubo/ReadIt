import { Volume2, Loader } from "lucide-react";

interface SelectionButtonProps {
  position: { x: number; y: number };
  onRead: () => void;
  loading: boolean;
  theme: "light" | "dark";
}

export function SelectionButton({
  position,
  onRead,
  loading,
  theme,
}: SelectionButtonProps) {
  return (
    <button
      className={`kokoro-btn${theme === "light" ? " theme-light" : ""}`}
      style={{
        position: "fixed",
        zIndex: 2147483647,
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: "translate(-50%, -100%) translateY(-8px)",
      }}
      onClick={onRead}
      disabled={loading}
    >
      {loading ? (
        <>
          <Loader size={14} className="spinner" />
          <span>Loading...</span>
        </>
      ) : (
        <>
          <Volume2 size={14} />
          <span>Read</span>
        </>
      )}
    </button>
  );
}
