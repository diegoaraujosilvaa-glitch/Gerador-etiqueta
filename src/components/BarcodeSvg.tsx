/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { encodeCode128B, getBarcodeBars } from "../utils/barcode";

interface BarcodeSvgProps {
  value: string;
  width?: number;
  height?: number;
}

export default function BarcodeSvg({ value, width = 300, height = 70 }: BarcodeSvgProps) {
  if (!value) {
    return (
      <div className="flex items-center justify-center border border-dashed border-gray-300 rounded h-[70px] bg-gray-50 text-xs text-gray-400">
        Sem código cadastrado
      </div>
    );
  }

  const pattern = encodeCode128B(value);

  if (!pattern) {
    return (
      <div className="flex items-center justify-center border border-red-200 rounded h-[70px] bg-red-50 text-xs text-red-500">
        Código inválido
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
              width={Math.max(0.5, bar.width)}
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
