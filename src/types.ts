/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MaterialRecord {
  id: string; // unique internal id
  codigoMaterial: string;
  ean: string;
  descricao: string;
  lote: string;
}

export type LabelSize = '100x75' | '80x50';

export interface PrinterConfig {
  densityDpi: number; // e.g., 203 dpi
  speed: number; // EPL speed (e.g., 2)
  darkness: number; // EPL darkness (e.g., 10)
}
