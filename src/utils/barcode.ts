/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Code 128 Barcode Generator
// Compact, correct implementation of Code 128 (Subset B)
// Supports uppercase, lowercase, numbers, and basic symbols.

const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", // 0-9
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", // 10-19
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "212123", // 20-29
  "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", "231113", // 30-39
  "231311", "112133", "112331", "132131", "113123", "113321", "133112", "313121", "211331", "231131", // 40-49
  "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", "314111", // 50-59
  "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", // 60-69
  "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242", // 70-79
  "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", "214121", // 80-89
  "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", "114131", // 90-99
  "311141", "411131", "211412", "211214", "211232", "233111", "211000" // 100-106 (106 is stop)
];

// Start Code B is pattern 104
const START_B = 104;
const STOP = 106;

export function encodeCode128B(text: string): string | null {
  // Filter text to basic printable ASCII
  const clean = text.replace(/[^\x20-\x7F]/g, "");
  if (!clean) return null;

  const codeValues: number[] = [START_B];
  
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i) - 32;
    codeValues.push(code);
  }

  // Calculate Checksum
  let checksum = codeValues[0];
  for (let i = 1; i < codeValues.length; i++) {
    checksum += codeValues[i] * i;
  }
  const checkDigit = checksum % 103;
  codeValues.push(checkDigit);
  codeValues.push(STOP);

  // Map to bar/space width sequence
  let patternString = "";
  for (const val of codeValues) {
    if (val >= 0 && val < CODE128_PATTERNS.length) {
      patternString += CODE128_PATTERNS[val];
    }
  }

  // Add the final stop bar (always a '2' on the end of stop pattern)
  patternString += "2";
  return patternString;
}

// Convert design pattern (e.g. "211214...") to SVG bars
// '1', '2', '3', '4' represent widths of alternating bars and spaces first bar, then space...
export interface BarInfo {
  x: number;
  width: number;
  isBar: boolean;
}

export function getBarcodeBars(pattern: string, totalWidth: number): BarInfo[] {
  // Sum up all pattern module lengths
  let totalModules = 0;
  for (let i = 0; i < pattern.length; i++) {
    totalModules += parseInt(pattern[i], 10);
  }

  const moduleWidth = totalWidth / totalModules;
  const bars: BarInfo[] = [];
  let currentX = 0;

  for (let i = 0; i < pattern.length; i++) {
    const widthModules = parseInt(pattern[i], 10);
    const pixelWidth = widthModules * moduleWidth;
    const isBar = i % 2 === 0; // standard starting with bar

    bars.push({
      x: currentX,
      width: pixelWidth,
      isBar
    });
    currentX += pixelWidth;
  }

  return bars;
}
