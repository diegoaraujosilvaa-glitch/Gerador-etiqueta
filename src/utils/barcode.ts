/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Code 128 Barcode Generator
// Compact, correct implementation of Code 128 (Subset B)
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
  "311141", "411131", "211412", "211214", "211232", "233111", "211000" // 100-106
];

const START_B = 104;
const STOP = 106;

export function encodeCode128B(text: string): string | null {
  const clean = text.replace(/[^\x20-\x7F]/g, "");
  if (!clean) return null;

  const codeValues: number[] = [START_B];
  for (let i = 0; i < clean.length; i++) {
    codeValues.push(clean.charCodeAt(i) - 32);
  }

  let checksum = codeValues[0];
  for (let i = 1; i < codeValues.length; i++) {
    checksum += codeValues[i] * i;
  }
  codeValues.push(checksum % 103);
  codeValues.push(STOP);

  let patternString = "";
  for (const val of codeValues) {
    if (val >= 0 && val < CODE128_PATTERNS.length) {
      patternString += CODE128_PATTERNS[val];
    }
  }
  patternString += "2";
  return patternString;
}

// EAN-13 Standard Barcode Specification Tables
const EAN13_L_CODE = [
  "0001101", "0011001", "0010011", "0111101", "0100011",
  "0110001", "0101111", "0111011", "0110111", "0001011"
];

const EAN13_G_CODE = [
  "0100111", "0110011", "0011011", "0100001", "0011101",
  "0111001", "0000101", "0010001", "0001001", "0010111"
];

const EAN13_R_CODE = EAN13_L_CODE.map(code => 
  code.split("").map(char => char === "0" ? "1" : "0").join("")
);

const PARITY_TABLE = [
  [0, 0, 0, 0, 0, 0], // 0
  [0, 0, 1, 0, 1, 1], // 1
  [0, 0, 1, 1, 0, 1], // 2
  [0, 0, 1, 1, 1, 0], // 3
  [0, 1, 0, 0, 1, 1], // 4
  [0, 1, 1, 0, 0, 1], // 5
  [0, 1, 1, 1, 0, 0], // 6
  [0, 1, 0, 1, 0, 1], // 7
  [0, 1, 0, 1, 1, 0], // 8
  [0, 1, 1, 0, 1, 0]  // 9
];

export function calculateEan13CheckDigit(digits12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(digits12[i], 10);
    if (i % 2 === 0) {
      sum += digit;
    } else {
      sum += digit * 3;
    }
  }
  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

export function encodeEan13(text: string): string | null {
  const cleaned = text.replace(/[^\d]/g, "");
  if (cleaned.length !== 12 && cleaned.length !== 13) return null;

  const first12 = cleaned.substring(0, 12);
  const checkDigit = calculateEan13CheckDigit(first12);
  const full13 = first12 + checkDigit.toString();

  const firstDigit = parseInt(full13[0], 10);
  const parities = PARITY_TABLE[firstDigit];

  let binary = "101"; // Left Guard (3 modules)

  // Left 6 digits (using indices 1 to 6)
  for (let i = 1; i <= 6; i++) {
    const digitValue = parseInt(full13[i], 10);
    const useG = parities[i - 1] === 1;
    binary += useG ? EAN13_G_CODE[digitValue] : EAN13_L_CODE[digitValue];
  }

  binary += "01010"; // Center Guard (5 modules)

  // Right 6 digits (using indices 7 to 12)
  for (let i = 7; i <= 12; i++) {
    const digitValue = parseInt(full13[i], 10);
    binary += EAN13_R_CODE[digitValue];
  }

  binary += "101"; // Right Guard (3 modules)

  return binary;
}

export interface BarInfo {
  x: number;
  width: number;
  isBar: boolean;
}

export function getBarcodeBars(pattern: string, totalWidth: number): BarInfo[] {
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
    const isBar = i % 2 === 0;

    bars.push({
      x: currentX,
      width: pixelWidth,
      isBar
    });
    currentX += pixelWidth;
  }

  return bars;
}

// Custom parser to map binary 1/0 string (from EAN-13) into bars
export function getEan13Bars(binary: string, totalWidth: number): BarInfo[] {
  const moduleWidth = totalWidth / 95; // EAN-13 always has exactly 95 modules
  const bars: BarInfo[] = [];

  for (let i = 0; i < binary.length; i++) {
    const isBar = binary[i] === "1";
    bars.push({
      x: i * moduleWidth,
      width: moduleWidth,
      isBar
    });
  }

  return bars;
}

export function generateBarcodeSvgMarkup(value: string, format?: 'EAN' | '128', width = 300, height = 70): string {
  if (!value) return "";
  
  const cleaned = value.replace(/[^\d]/g, "");
  const isEanEligible = (format === "EAN" || (!format && (cleaned.length === 12 || cleaned.length === 13)));

  if (isEanEligible) {
    const binary = encodeEan13(cleaned);
    if (binary) {
      const bars = getEan13Bars(binary, width);
      const first12 = cleaned.substring(0, 12);
      const checkDigit = calculateEan13CheckDigit(first12);
      const finalEanText = first12 + checkDigit.toString();
      const formattedText = `${finalEanText[0]} ${finalEanText.substring(1, 7)} ${finalEanText.substring(7)}`;

      let rectsMarkup = "";
      bars.forEach(bar => {
        if (bar.isBar) {
          rectsMarkup += `<rect x="${bar.x}" y="0" width="${Math.max(0.2, bar.width)}" height="${height}" fill="black" />`;
        }
      });

      return `
        <div style="font-family: monospace; display: flex; flex-direction: column; align-items: center; width: 100%;">
          <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" style="shape-rendering: crispEdges;">
            <rect width="100%" height="${height}" fill="white" />
            ${rectsMarkup}
          </svg>
          <span style="font-size: 10px; margin-top: 2px; font-weight: bold; letter-spacing: 2px; color: black; display: block; text-align: center;">${formattedText}</span>
        </div>
      `;
    }
  }

  // Fallback to Code 128
  const pattern = encodeCode128B(value);
  if (!pattern) return "";

  const bars = getBarcodeBars(pattern, width);
  let rectsMarkup = "";
  bars.forEach(bar => {
    if (bar.isBar) {
      rectsMarkup += `<rect x="${bar.x}" y="0" width="${Math.max(0.5, bar.width)}" height="${height}" fill="black" />`;
    }
  });

  return `
    <div style="font-family: monospace; display: flex; flex-direction: column; align-items: center; width: 100%;">
      <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" style="shape-rendering: crispEdges;">
        <rect width="100%" height="${height}" fill="white" />
        ${rectsMarkup}
      </svg>
      <span style="font-size: 10px; margin-top: 2px; font-weight: bold; letter-spacing: 2px; color: black; display: block; text-align: center;">${value}</span>
    </div>
  `;
}
