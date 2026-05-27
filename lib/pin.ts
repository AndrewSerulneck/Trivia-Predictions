export function normalizePinDigits(value: string): string {
  const input = String(value ?? "");
  let output = "";

  for (const char of input) {
    const code = char.codePointAt(0);
    if (code === undefined) continue;

    // ASCII digits
    if (code >= 0x30 && code <= 0x39) {
      output += char;
      continue;
    }

    // Arabic-Indic digits
    if (code >= 0x0660 && code <= 0x0669) {
      output += String(code - 0x0660);
      continue;
    }

    // Extended Arabic-Indic digits
    if (code >= 0x06f0 && code <= 0x06f9) {
      output += String(code - 0x06f0);
      continue;
    }

    // Devanagari digits
    if (code >= 0x0966 && code <= 0x096f) {
      output += String(code - 0x0966);
      continue;
    }

    // Full-width digits
    if (code >= 0xff10 && code <= 0xff19) {
      output += String(code - 0xff10);
      continue;
    }
  }

  return output;
}

export function normalizePin(value: string): string {
  return normalizePinDigits(value).slice(0, 4);
}

export function isValidPin(value: string): boolean {
  return /^\d{4}$/.test(normalizePin(value));
}
