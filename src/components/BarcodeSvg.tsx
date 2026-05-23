/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { encodeCode128B, getBarcodeBars, encodeEan13, getEan13Bars, calculateEan13CheckDigit } from "../utils/barcode";

interface BarcodeSvgProps {
  value: string;
  width?: number;
  height?: number;
  format?: 'EAN' | '128';
}

export default function BarcodeSvg({ value, width = 300, height = 70, format }: BarcodeSvgProps) {
  if (!value) {
    return (
      <div className="flex items-center justify-center border border-dashed border-gray-300 rounded h-[70px] bg-gray-50 text-xs text-gray-400">
        Sem código cadastrado
      </div>
    );
  }

  const cleaned = value.replace(/[^\d]/g, "");
  const isEanEligible = (format === "EAN" || (!format && (cleaned.length === 12 || cleaned.length === 13)));

  if (isEanEligible) {
    const binary = encodeEan13(cleaned);
    if (binary) {
      const bars = getEan13Bars(binary, width);
      const first12 = cleaned.substring(0, 12);
      const checkDigit = calculateEan13CheckDigit(first12);
      const finalEanText = first12 + checkDigit.toString();

      // standard EAN-13 printing format: "7 895240 001024"
      const formattedText = `${finalEanText[0]} ${finalEanText.substring(1, 7)} ${finalEanText.substring(7)}`;

      return (
        <div className="flex flex-col items-center select-none font-mono">
          <svg 
            width={width} 
            height={height} 
            viewBox={`0 0 ${width} ${height}`} 
            className="w-full h-auto"
            style={{ shapeRendering: "crispEdges" }}
          >
            <rect width={width} height={height} fill="white" />
            {bars.map((bar, idx) => {
              if (!bar.isBar) return null;
              return (
                <rect
                  key={idx}
                  x={bar.x}
                  y={0}
                  width={bar.width}
                  height={height}
                  fill="black"
                />
              );
            })}
          </svg>
          <span className="text-[10px] mt-1 font-bold text-black tracking-[0.12em]">{formattedText}</span>
        </div>
      );
    }
  }

  // Fallback to Code 128
  const pattern = encodeCode128B(value);

  if (!pattern) {
    return (
      <div className="flex items-center justify-center border border-red-200 rounded h-[70px] bg-red-50 text-xs text-red-500">
        Código Code128 inválido
      </div>
    );
  }

  const bars = getBarcodeBars(pattern, width);

  return (
    <div className="flex flex-col items-center select-none font-mono">
      <svg 
        width={width} 
        height={height} 
        viewBox={`0 0 ${width} ${height}`} 
        className="w-full h-auto"
        style={{ shapeRendering: "crispEdges" }}
      >
        <rect width={width} height={height} fill="white" />
        {bars.map((bar, idx) => {
          if (!bar.isBar) return null;
          return (
            <rect
              key={idx}
              x={bar.x}
              y={0}
              width={bar.width}
              height={height}
              fill="black"
            />
          );
        })}
      </svg>
      <span className="text-[10px] mt-1 font-bold text-black tracking-[0.25em]">{value}</span>
    </div>
  );
}
