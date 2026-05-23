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

  let eplBarcodeData = finalEanForBarcode;
  if (isEanEligible && eanBarcodeType === "E30") {
    // Para impressoras EPL2 Zebra, a simbologia E30 (EAN-13) espera exatamente 12 dígitos.
    // O 13º dígito (verificador) é calculado e adicionado automaticamente pela própria impressora.
    eplBarcodeData = finalEanForBarcode.substring(0, 12);
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
    // 100mm x 75mm label (Landscape, centered stacked large layout)
    // At 203 dpi: 100mm ~ 800 dots wide, 75mm ~ 600 dots high.
    epl += "q800\n";
    epl += "Q600,24\n";

    // Product Code
    epl += `A30,25,0,2,1,1,N,"COD. MATERIAL:"\n`;
    epl += `A180,25,0,4,1,1,N,"${cod}"\n`;

    // Description text (wrapped up to 2 lines to save vertical space for huge barcodes)
    const descLines = wrapText(desc, 52);
    const line1 = descLines[0] || "";
    const line2 = descLines[1] || "";
    epl += `A30,65,0,3,1,1,N,"${line1}"\n`;
    if (line2) {
      epl += `A30,95,0,3,1,1,N,"${line2}"\n`;
    }

    // Stacked Barcode 1 (EAN on top)
    epl += `A100,150,0,3,1,1,N,"EAN: ${finalEanForBarcode}"\n`;
    epl += `B100,180,0,${eanBarcodeType},4,8,125,B,"${eplBarcodeData}"\n`;

    // Stacked Barcode 2 (LOTE on bottom)
    epl += `A100,345,0,3,1,1,N,"LOTE: ${lote}"\n`;
    epl += `B100,375,0,1,3,7,125,B,"${lote}"\n`;

  } else {
    // 80mm x 50mm label (Landscape, centered stacked layout)
    // At 203 dpi: 80mm ~ 640 dots wide, 50mm ~ 400 dots high.
    epl += "q640\n";
    epl += "Q400,24\n";

    // Product Code
    epl += `A30,15,0,2,1,1,N,"COD. MATERIAL:"\n`;
    epl += `A180,15,0,3,1,1,N,"${cod}"\n`;

    // Description text
    const descLines = wrapText(desc, 42);
    const line1 = descLines[0] || "";
    const line2 = descLines[1] || "";
    epl += `A30,45,0,2,1,1,N,"${line1}"\n`;
    if (line2) {
      epl += `A30,68,0,2,1,1,N,"${line2}"\n`;
    }

    // Stacked Barcode 1 (EAN on top)
    epl += `A60,105,0,2,1,1,N,"EAN: ${finalEanForBarcode}"\n`;
    epl += `B60,130,0,${eanBarcodeType},3,6,85,B,"${eplBarcodeData}"\n`;

    // Stacked Barcode 2 (LOTE on bottom)
    epl += `A60,250,0,2,1,1,N,"LOTE: ${lote}"\n`;
    epl += `B60,275,0,1,3,6,85,B,"${lote}"\n`;
  }

  // 5. Print command: P[number of labels]
  epl += "P1\n";

  return epl;
}
