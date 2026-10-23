// Copy text to the clipboard, with the old textarea fallback for web views without the
// Clipboard API. Must be called from a tap (browsers allow clipboard writes only then).

const legacyCopy = (text: string): boolean => {
  if (typeof document === "undefined") return false;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.className = "fixed left-0 top-0 opacity-0";
  document.body.appendChild(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
};

export const copyText = async (text: string): Promise<boolean> => {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the textarea
    }
  }
  return legacyCopy(text);
};
