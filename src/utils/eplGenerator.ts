/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaterialRecord, LabelSize, PrinterConfig } from "../types";
import { calculateEan13CheckDigit } from "./barcode";

// Helper to remove accents and special characters for standard EPL printers
export function sanitizeEplText(text: string): string {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // removes accents
    .replace(/[^\x20-\x7E]/g, "?") // replaces any non-ASCII character with '?'
    .toUpperCase();
}

// Word wrap helper for descriptions
export function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + " " + word).trim().length <= maxChars) {
      currentLine = currentLine ? currentLine + " " + word : word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

export function generateEPL(
  record: MaterialRecord,
  size: LabelSize,
  config: PrinterConfig = { densityDpi: 203, speed: 2, darkness: 10 }
): string {
  const dateStr = new Date().toLocaleDateString("pt-BR");
  
  const cod = sanitizeEplText(record.codigoMaterial);
  const desc = sanitizeEplText(record.descricao);
  const lote = sanitizeEplText(record.lote);
  
  const eanRaw = record.ean || "";
  const cleanedEan = eanRaw.replace(/[^\d]/g, "");
  const isEanEligible = cleanedEan.length === 12 || cleanedEan.length === 13;
  let finalEanForBarcode = eanRaw;
  let eanBarcodeType = "1"; // Code 128 (default)

  if (isEanEligible) {
    const first12 = cleanedEan.substring(0, 12);
    const checkDigit = calculateEan13CheckDigit(first12);
    finalEanForBarcode = first12 + checkDigit.toString();
    eanBarcodeType = "E30"; // EAN-13 for EPL
  } else {
    finalEanForBarcode = sanitizeEplText(finalEanForBarcode);
  }

  let epl = "";

  // 1. Clear Image Buffer
  epl += "N\n";

  // 2. Set Speed
  epl += `S${config.speed}\n`;

  // 3. Set Darkness / Density
  epl += `D${config.darkness}\n`;

  // 4. Set Reference point (0,0)
  epl += "ZT\n";

  if (size === "100x75") {
    // 100mm x 75mm label (Landscape)
    // At 203 dpi: 100mm ~ 800 dots wide, 75mm ~ 600 dots high.
    epl += "q800\n";
    epl += "Q600,24\n";

    // Draw top framing line
    epl += "LO10,20,780,4\n";

    // Header Title
    epl += `A20,35,0,3,1,1,N,"IDENTIFICACAO DE MATERIAL (HORIZONTAL)"\n`;
    epl += "LO10,65,780,2\n";

    // Material Code
    epl += `A20,80,0,2,1,1,N,"COD. MATERIAL:"\n`;
    epl += `A180,80,0,4,1,1,N,"${cod}"\n`;

    // Description text (wrap up to 3 lines, limit to ~52 chars per line)
    epl += `A20,125,0,2,1,1,N,"DESCRICAO:"\n`;
    const descLines = wrapText(desc, 52);
    const line1 = descLines[0] || "";
    const line2 = descLines[1] || "";
    const line3 = descLines[2] || "";
    epl += `A20,150,0,3,1,1,N,"${line1}"\n`;
    if (line2) {
      epl += `A20,180,0,3,1,1,N,"${line2}"\n`;
    }
    if (line3) {
      epl += `A20,210,0,3,1,1,N,"${line3}"\n`;
    }

    epl += "LO10,250,780,1\n";

    // Side-by-Side Barcodes to fully leverage Horizontal scope
    // Left side: EAN Code
    epl += `A20,265,0,2,1,1,N,"EAN: ${finalEanForBarcode}"\n`;
    epl += `B20,290,0,${eanBarcodeType},2,5,80,B,"${finalEanForBarcode}"\n`;

    // Right side: LOTE Code
    epl += `A420,265,0,2,1,1,N,"LOTE: ${lote}"\n`;
    epl += `B420,290,0,1,2,5,80,B,"${lote}"\n`;

    // Footer lines
    epl += "LO10,480,780,2\n";
    epl += `A20,500,0,2,1,1,N,"ZEBRA GT800 (EPL) - HORIZONTAL"\n`;
    epl += `A420,500,0,2,1,1,N,"DATA: ${dateStr}"\n`;
    epl += `A680,500,0,2,1,1,N,"100x75"\n`;

  } else {
    // 80mm x 50mm label (Landscape)
    // At 203 dpi: 80mm ~ 640 dots wide, 50mm ~ 400 dots high.
    epl += "q640\n";
    epl += "Q400,24\n";

    // Draw top line
    epl += "LO10,15,620,3\n";

    // Header Title
    epl += `A20,25,0,2,1,1,N,"IDENTIFICACAO SKU (HORIZONTAL)"\n`;
    epl += "LO10,50,620,2\n";

    // Material Code
    epl += `A20,65,0,2,1,1,N,"COD: ${cod}"\n`;

    // Description text (wrapped up to 2 lines, limit to ~42 chars per line)
    const descLines = wrapText(desc, 42);
    const line1 = descLines[0] || "";
    const line2 = descLines[1] || "";
    epl += `A20,95,0,2,1,1,N,"DESC: ${line1}"\n`;
    if (line2) {
      epl += `A20,120,0,2,1,1,N,"      ${line2}"\n`;
    }

    epl += "LO10,145,620,1\n";

    // Side-by-Side Barcodes for 80x50 label
    // Left side: EAN Code
    epl += `A20,160,0,1,1,1,N,"EAN: ${finalEanForBarcode}"\n`;
    epl += `B20,180,0,${eanBarcodeType},2,4,65,B,"${finalEanForBarcode}"\n`;

    // Right side: LOTE Code
    epl += `A330,160,0,1,1,1,N,"LOTE: ${lote}"\n`;
    epl += `B330,180,0,1,2,4,65,B,"${lote}"\n`;

    // Footer
    epl += "LO10,295,620,2\n";
    epl += `A20,315,0,1,1,1,N,"ZEBRA GT800 (EPL) - 80x50"\n`;
    epl += `A480,315,0,1,1,1,N,"${dateStr}"\n`;
  }

  // 5. Print command: P[number of labels]
  epl += "P1\n";

  return epl;
}
