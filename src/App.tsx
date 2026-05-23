/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, ChangeEvent, DragEvent } from "react";
import { animate, motion, AnimatePresence } from "motion/react";
import { 
  FileSpreadsheet, 
  Search, 
  Printer, 
  Download, 
  Copy, 
  Check, 
  Upload, 
  Database, 
  Info, 
  RefreshCw, 
  Clipboard, 
  HelpCircle, 
  Maximize2, 
  Sparkles,
  Layers,
  ChevronRight,
  FileText
} from "lucide-react";
import { MaterialRecord, LabelSize, PrinterConfig } from "./types";
import { generateEPL, sanitizeEplText, wrapText } from "./utils/eplGenerator";
import BarcodeSvg from "./components/BarcodeSvg";
import { generateBarcodeSvgMarkup } from "./utils/barcode";

// Pre-loaded initial sample data
const MOCK_MATERIALS: MaterialRecord[] = [
  {
    id: "1",
    codigoMaterial: "1002010",
    descricao: "CABO FLEXÍVEL SIL 2.5MM BRANCO 100M",
    ean: "7895240001024",
    lote: "L-AF2026X"
  },
  {
    id: "2",
    codigoMaterial: "1002011",
    descricao: "DISJUNTOR DIN UNIPOLAR 16A STECK",
    ean: "7895240049583",
    lote: "L-2204B7"
  },
  {
    id: "3",
    codigoMaterial: "2004052",
    descricao: "TOMADA DUPLEX 2P+T 10A TRAMONTINA",
    ean: "7891112223334",
    lote: "L-TX908B"
  },
  {
    id: "4",
    codigoMaterial: "3001099",
    descricao: "FITA ISOLANTE 3M IMPERIAL 20 METROS BLACK",
    ean: "7892224446668",
    lote: "L-IS3M-11"
  },
  {
    id: "5",
    codigoMaterial: "4005080",
    descricao: "REFLETOR LED 50W BRANCO AVANT SLIM",
    ean: "7893335557779",
    lote: "L-LED50-9"
  }
];

export default function App() {
  // Application State
  const [materials, setMaterials] = useState<MaterialRecord[]>(() => {
    const saved = localStorage.getItem("materials_db");
    return saved ? JSON.parse(saved) : MOCK_MATERIALS;
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<MaterialRecord | null>(materials[0] || null);
  const [labelSize, setLabelSize] = useState<LabelSize>("100x75");
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"visual" | "epl" | "guia">("visual");
  const [dragActive, setDragActive] = useState(false);
  
  // Zebra Printer params State
  const [printerConfig, setPrinterConfig] = useState<PrinterConfig>({
    densityDpi: 203,
    speed: 2,
    darkness: 10
  });

  // Mapping state for CSV columns
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [mappingPending, setMappingPending] = useState(false);
  const [mappings, setMappings] = useState({
    codigoMaterial: "",
    ean: "",
    descricao: "",
    lote: ""
  });

  const [notif, setNotif] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);

  // Persistence
  useEffect(() => {
    localStorage.setItem("materials_db", JSON.stringify(materials));
  }, [materials]);

  // Show auto-dismiss notification
  const triggerNotification = (type: "success" | "error" | "info", msg: string) => {
    setNotif({ type, msg });
    setTimeout(() => {
      setNotif(null);
    }, 4500);
  };

  // Pre-fill columns mappings when headers are parsed
  useEffect(() => {
    if (csvHeaders.length > 0) {
      // Auto-detect columns
      const detected = {
        codigoMaterial: "",
        ean: "",
        descricao: "",
        lote: ""
      };

      const normalizedHeaders = csvHeaders.map(h => h.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
      
      normalizedHeaders.forEach((header, index) => {
        const orig = csvHeaders[index];
        if (header.includes("COD") || header.includes("MAT") || header.includes("SKU") || header.includes("REF")) {
          detected.codigoMaterial = orig;
        } else if (header.includes("EAN") || header.includes("BARRA") || header.includes("BARCODE")) {
          detected.ean = orig;
        } else if (header.includes("DESC") || header.includes("NOME") || header.includes("PRODUTO") || header.includes("ITEM")) {
          detected.descricao = orig;
        } else if (header.includes("LOT") || header.includes("BATCH") || header.includes("VALID")) {
          detected.lote = orig;
        }
      });

      // Fallbacks if not auto-detected
      if (!detected.codigoMaterial && csvHeaders[0]) detected.codigoMaterial = csvHeaders[0];
      if (!detected.ean && csvHeaders[1]) detected.ean = csvHeaders[1];
      if (!detected.descricao && csvHeaders[2]) detected.descricao = csvHeaders[2];
      if (!detected.lote && csvHeaders[3]) detected.lote = csvHeaders[3];

      setMappings(detected);
    }
  }, [csvHeaders]);

  // Search filter
  const filteredMaterials = searchQuery.trim() === "" 
    ? materials.slice(0, 5) // Show top 5 if empty search
    : materials.filter(m => {
        const query = searchQuery.toLowerCase();
        return (
          m.codigoMaterial.toLowerCase().includes(query) ||
          m.ean.toLowerCase().includes(query) ||
          m.descricao.toLowerCase().includes(query)
        );
      });

  // Handle CSV parser
  const handleCSVText = (text: string) => {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
    if (lines.length === 0) {
      triggerNotification("error", "O arquivo enviado está vazio!");
      return;
    }

    // Determine delimiter (comma or semicolon)
    const firstLine = lines[0];
    const delimiter = firstLine.includes(";") ? ";" : ",";

    // Split headers
    const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ""));
    
    // Split remaining rows
    const rows = lines.slice(1).map(line => {
      // simple split by comma/semicolon respecting double quotes
      let inQuotes = false;
      let token = "";
      const tokens: string[] = [];

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
          tokens.push(token.trim().replace(/^["']|["']$/g, ""));
          token = "";
        } else {
          token += char;
        }
      }
      tokens.push(token.trim().replace(/^["']|["']$/g, ""));
      return tokens;
    });

    if (headers.length < 2) {
      triggerNotification("error", "Não foi possível estruturar o arquivo! Verifique o delimitador (Vírgula ou Ponto e Vírgula).");
      return;
    }

    setCsvHeaders(headers);
    setCsvRows(rows);
    setMappingPending(true);
    triggerNotification("info", "Estrutura do arquivo carregada! Faça o mapeamento de colunas.");
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        handleCSVText(text);
      };
      reader.readAsText(file, "UTF-8");
    }
  };

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        handleCSVText(text);
      };
      reader.readAsText(file, "UTF-8");
    }
  };

  // Convert parsed CSV rows into material records based on mappings
  const saveImportedData = () => {
    const codeIdx = csvHeaders.indexOf(mappings.codigoMaterial);
    const eanIdx = csvHeaders.indexOf(mappings.ean);
    const descIdx = csvHeaders.indexOf(mappings.descricao);
    const loteIdx = csvHeaders.indexOf(mappings.lote);

    if (codeIdx === -1 || eanIdx === -1 || descIdx === -1 || loteIdx === -1) {
      triggerNotification("error", "Mapeamento inválido! Certifique-se de associar todas as 4 colunas.");
      return;
    }

    const imported: MaterialRecord[] = csvRows
      .filter(row => row.length > Math.max(codeIdx, eanIdx, descIdx, loteIdx))
      .map((row, idx) => ({
        id: `imported-${Date.now()}-${idx}`,
        codigoMaterial: row[codeIdx],
        ean: row[eanIdx],
        descricao: row[descIdx],
        lote: row[loteIdx]
      }))
      .filter(m => m.codigoMaterial || m.ean); // make sure there is at least some identifier

    if (imported.length === 0) {
      triggerNotification("error", "Nenhum material válido pôde ser importado do arquivo!");
      return;
    }

    // Append to existing database
    setMaterials(prev => {
      // Avoid duplicate codes if possible
      const filteredPrev = prev.filter(p => !imported.some(imp => imp.codigoMaterial.trim() === p.codigoMaterial.trim()));
      const combined = [...filteredPrev, ...imported];
      if (combined.length > 0) {
        setSelectedRecord(combined[0]);
      }
      return combined;
    });

    setMappingPending(false);
    setCsvHeaders([]);
    setCsvRows([]);
    triggerNotification("success", `${imported.length} materiais importados e mapeados com sucesso!`);
  };

  const clearDatabase = () => {
    if (confirm("Tem certeza que deseja apagar todos os materiais cadastrados?")) {
      setMaterials([]);
      setSelectedRecord(null);
      triggerNotification("info", "Banco de dados limpo com sucesso!");
    }
  };

  const resetMockData = () => {
    setMaterials(MOCK_MATERIALS);
    setSelectedRecord(MOCK_MATERIALS[0]);
    triggerNotification("success", "Banco de dados recarregado com dados de exemplo!");
  };

  // Download templates
  const downloadCsvTemplate = () => {
    const csvContent = "CÓDIGO MATERIAL,EAN,DESCRIÇÃO,LOTE\n1005010,7891234567897,LÂMPADA LED 9W PHILIPS BIVOLT,LT2026A1\n2004051,7891112223334,TOMADA 2P+T EMBUTIR WEG BRANCO,LT2025B4\n3009088,7898765432101,FIO CABO CORDÃO PARALELO 2X1.5MM 50M,LOT-X-09\n";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "modelo_dados_etiquetas.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Generates complete EPL string
  const eplCode = selectedRecord ? generateEPL(selectedRecord, labelSize, printerConfig) : "";

  // Copia código EPL para o clipboard
  const handleCopyEpl = () => {
    if (!eplCode) return;
    navigator.clipboard.writeText(eplCode).then(() => {
      setCopied(true);
      triggerNotification("success", "Código EPL2 copiado!");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Baixa arquivo .EPL
  const handleDownloadEplFile = () => {
    if (!selectedRecord) return;
    const blob = new Blob([eplCode], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `zebralabel-${selectedRecord.codigoMaterial || selectedRecord.id}.epl`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerNotification("success", "Arquivo .EPL baixado com sucesso!");
  };

  // Abre janela limpa apenas com a etiqueta HTML para impressão direta no navegador
  const handlePrintBrowser = () => {
    if (!selectedRecord) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      triggerNotification("error", "Pop-up de impressão bloqueado pelo navegador!");
      return;
    }

    const cod = sanitizeEplText(selectedRecord.codigoMaterial);
    const desc = sanitizeEplText(selectedRecord.descricao);
    const lote = sanitizeEplText(selectedRecord.lote);
    const ean = sanitizeEplText(selectedRecord.ean);

    const svgWidth = labelSize === "100x75" ? 440 : 360;
    const svgHeight = labelSize === "100x75" ? 95 : 70;
    const eanSvgMarkup = generateBarcodeSvgMarkup(selectedRecord.ean, undefined, svgWidth, svgHeight);
    const loteSvgMarkup = generateBarcodeSvgMarkup(selectedRecord.lote, '128', svgWidth, svgHeight);

    // Dynamic measurements based on sizes
    const pixelWidth = labelSize === "100x75" ? "504px" : "415px"; // equivalent to ~5.00 in vs 4.09 in
    const pixelHeight = labelSize === "100x75" ? "378px" : "264px"; // equivalent to ~3.72 in vs 2.60 in

    const descWrapped = wrapText(desc, labelSize === "100x75" ? 52 : 42);
    const descLine1 = descWrapped[0] || "";
    const descLine2 = descWrapped[1] || "";

    const dateStr = new Date().toLocaleDateString("pt-BR");

    printWindow.document.write(`
      <html>
        <head>
          <title>Imprimir Etiqueta ${cod}</title>
          <style>
            @page {
              size: ${labelSize === "100x75" ? "100mm 75mm" : "80mm 50mm"};
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              background-color: white;
              font-family: 'Courier New', Courier, monospace;
              color: black;
              -webkit-print-color-adjust: exact;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .label-container {
              width: ${pixelWidth};
              height: ${pixelHeight};
              border: 1px solid #ccc;
              box-sizing: border-box;
              padding: ${labelSize === "100x75" ? "16px 20px" : "12px 14px"};
              display: flex;
              flex-direction: column;
              justify-content: flex-start;
              background-color: white;
              position: relative;
            }
            @media print {
              .label-container {
                border: none;
                width: 100%;
                height: 100%;
                padding: ${labelSize === "100x75" ? "12px 16px" : "8px 10px"};
              }
            }
            .grid-row {
              margin: 0;
              font-size: ${labelSize === "100x75" ? "14px" : "11px"};
            }
            .bold-label {
              font-weight: bold;
            }
            .desc-area {
              margin-top: 3px;
              font-size: ${labelSize === "100x75" ? "12px" : "10px"};
              line-height: 1.2;
            }
            .desc-line {
              font-weight: bold;
            }
            .barcode-stack {
              display: flex;
              flex-direction: column;
              gap: ${labelSize === "100x75" ? "14px" : "10px"};
              margin-top: ${labelSize === "100x75" ? "14px" : "10px"};
              width: 100%;
            }
            .barcode-item {
              display: flex;
              flex-direction: column;
              width: 100%;
            }
            .barcode-title {
              font-size: ${labelSize === "100x75" ? "11px" : "9.5px"};
              font-weight: 900;
              margin-bottom: 2px;
              text-transform: uppercase;
            }
          </style>
        </head>
        <body>
          <div class="label-container" id="imprimir-etiqueta">
            <!-- Product Code and Description ONLY -->
            <div>
              <div class="grid-row">
                <span class="bold-label">${labelSize === "100x75" ? "COD. MATERIAL:" : "COD:"}</span> 
                <span style="font-weight: 900; font-size: ${labelSize === "100x75" ? "18px" : "15px"};">${cod}</span>
              </div>
              
              <div class="desc-area">
                <div class="desc-line">${descLine1}</div>
                ${descLine2 ? `<div class="desc-line">${descLine2}</div>` : ""}
              </div>
            </div>

            <!-- Vertically Stacked Giant Barcodes -->
            <div class="barcode-stack">
              <div class="barcode-item">
                <span class="barcode-title">EAN:</span>
                <div style="width: 100%;">
                  ${eanSvgMarkup}
                </div>
              </div>

              <div class="barcode-item">
                <span class="barcode-title">LOTE:</span>
                <div style="width: 100%;">
                  ${loteSvgMarkup}
                </div>
              </div>
            </div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    triggerNotification("success", "Janela de impressão aberta!");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-teal-500 selection:text-slate-900" id="main-container">
      {/* Top Header Row representing actual industrial standards */}
      <header className="border-b border-slate-900 bg-slate-950 py-4 px-6 sticky top-0 z-40 backdrop-blur-md bg-opacity-95" id="app-header">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-xl shadow-lg shadow-teal-500/10">
              <Printer className="w-6 h-6 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Zebra GT800 <span className="text-[10px] uppercase tracking-wider bg-teal-500/10 text-teal-400 px-2 py-0.5 rounded border border-teal-500/20 font-mono font-bold">EPL2</span>
              </h1>
              <p className="text-xs text-slate-400">Emissor & Gerador de Etiquetas de Identificação</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button 
              id="btn-download-template"
              onClick={downloadCsvTemplate}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-slate-800 bg-slate-900/50 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 hover:border-slate-700 transition"
            >
              <Download className="w-3.5 h-3.5" />
              Modelo Planilha CSV
            </button>
            <button
              id="btn-rebuild-mock"
              onClick={resetMockData}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-800/60 bg-slate-900/10 text-xs font-semibold text-slate-400 hover:text-teal-400 transition"
              title="Recarregar materiais padrão"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Resetar Banco
            </button>
          </div>
        </div>
      </header>

      {/* Persistent notifications inside app container */}
      <AnimatePresence>
        {notif && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-20 right-6 z-50 rounded-lg p-3.5 shadow-xl flex items-center gap-3 border text-xs max-w-sm ${
              notif.type === "success" 
                ? "bg-slate-900 border-teal-500/30 text-teal-300" 
                : notif.type === "error"
                ? "bg-slate-900 border-rose-500/30 text-rose-300"
                : "bg-slate-900 border-cyan-500/30 text-cyan-300"
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${
              notif.type === "success" ? "bg-teal-400" : notif.type === "error" ? "bg-rose-400" : "bg-cyan-400"
            }`} />
            <span>{notif.msg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6" id="dashboard-layout">
        
        {/* LEFT COLUMN: Data Upload & Materials Collection Explorer */}
        <section className="lg:col-span-5 flex flex-col gap-6" id="left-column">
          
          {/* Card: Drag & Drop CSV Import */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5" id="import-card">
            <h2 className="text-sm font-bold tracking-wider text-slate-300 uppercase mb-3.5 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              Importar Base de Planilha
            </h2>

            {!mappingPending ? (
              <div 
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`border border-dashed rounded-lg p-6 text-center transition flex flex-col items-center justify-center cursor-pointer ${
                  dragActive 
                    ? "border-teal-500 bg-teal-500/5" 
                    : "border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-950/60"
                }`}
              >
                <Upload className="w-8 h-8 text-slate-500 mb-2.5" />
                <p className="text-xs font-medium text-slate-300">Arraste ou clique para carregar CSV</p>
                <p className="text-[10px] text-slate-500 mt-1">Colunas necessárias: CÓDIGO, EAN, DESCRIÇÃO e LOTE</p>
                
                <input 
                  type="file" 
                  accept=".csv" 
                  onChange={handleFileUpload} 
                  className="hidden" 
                  id="csv-file-input" 
                />
                <button 
                  onClick={() => document.getElementById("csv-file-input")?.click()}
                  className="mt-3.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-[11px] font-bold text-slate-200 transition"
                >
                  Selecionar Local
                </button>
              </div>
            ) : (
              // Excel mapping screen
              <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-4 font-mono text-xs space-y-4" id="mapping-panel">
                <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                  <span className="font-bold text-teal-400">Mapeamento de Colunas</span>
                  <span className="text-[10px] text-slate-500">Localizados {csvRows.length} itens</span>
                </div>
                
                <p className="text-[11px] text-slate-400 font-sans">
                  Associe as colunas da sua planilha com os campos solicitados pela etiqueta Zebra:
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] uppercase text-slate-500 mb-1 font-sans">Código do Material</label>
                    <select
                      value={mappings.codigoMaterial}
                      onChange={(e) => setMappings(prev => ({ ...prev, codigoMaterial: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500"
                    >
                      <option value="">Selecione a coluna...</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase text-slate-500 mb-1 font-sans">Código de Barras EAN</label>
                    <select
                      value={mappings.ean}
                      onChange={(e) => setMappings(prev => ({ ...prev, ean: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500"
                    >
                      <option value="">Selecione a coluna...</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase text-slate-500 mb-1 font-sans">Descrição do Material</label>
                    <select
                      value={mappings.descricao}
                      onChange={(e) => setMappings(prev => ({ ...prev, descricao: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500"
                    >
                      <option value="">Selecione a coluna...</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase text-slate-500 mb-1 font-sans">Lote Técnico</label>
                    <select
                      value={mappings.lote}
                      onChange={(e) => setMappings(prev => ({ ...prev, lote: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500"
                    >
                      <option value="">Selecione a coluna...</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={saveImportedData}
                    className="flex-1 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold rounded text-xs transition"
                  >
                    Confirmar & Carregar
                  </button>
                  <button
                    onClick={() => {
                      setMappingPending(false);
                      setCsvHeaders([]);
                      setCsvRows([]);
                    }}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 rounded border border-slate-800 text-slate-400 text-xs transition"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Card: Query database module */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 flex-1 flex flex-col" id="search-card">
            <div className="flex items-center justify-between mb-3.5">
              <h2 className="text-sm font-bold tracking-wider text-slate-300 uppercase flex items-center gap-2">
                <Database className="w-4 h-4 text-teal-400" />
                Consulta de Materiais
              </h2>
              <span className="text-[10px] font-mono bg-slate-950 px-2 py-0.5 border border-slate-800 rounded text-slate-500">
                {materials.length} itens
              </span>
            </div>

            {/* Search inputs */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Busque por CÓDIGO MATERIAL ou EAN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-teal-500 rounded-lg pl-9 pr-4 py-2 text-xs text-white focus:outline-none transition placeholder:text-slate-600"
              />
            </div>

            {/* Results explorer list */}
            <div className="flex-1 overflow-y-auto max-h-[380px] space-y-2 pr-1" id="materials-list-container">
              {filteredMaterials.length > 0 ? (
                filteredMaterials.map((m) => {
                  const isSelected = selectedRecord?.id === m.id;
                  return (
                    <motion.div
                      key={m.id}
                      onClick={() => setSelectedRecord(m)}
                      className={`p-3 rounded-lg border transition duration-150 cursor-pointer text-left ${
                        isSelected 
                          ? "bg-slate-900 border-teal-500/60 shadow-lg shadow-teal-500/5" 
                          : "bg-slate-950/40 border-slate-800/70 hover:bg-slate-950 hover:border-slate-800"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-mono font-extrabold text-teal-400 bg-teal-500/5 px-1.5 py-0.5 rounded">
                          COD: {m.codigoMaterial}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          EAN: {m.ean}
                        </span>
                      </div>
                      
                      <p className="text-xs font-semibold text-slate-200 line-clamp-1 mb-1.5">{m.descricao}</p>
                      
                      <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-900/40 pt-1.5 font-mono">
                        <span>Lote: <strong className="text-slate-400 font-bold">{m.lote}</strong></span>
                        <span className="flex items-center gap-1 text-slate-400 font-bold">
                          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-teal-400 inline-block animate-pulse" />}
                          Etiqueta
                        </span>
                      </div>
                    </motion.div>
                  );
                })
              ) : (
                <div className="text-center py-10 border border-dashed border-slate-800/40 rounded-lg">
                  <Info className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-400 font-medium">Nenhum resultado para a busca</p>
                  <p className="text-[10px] text-slate-500 mt-1">Insira um código válido ou importe mais registros.</p>
                </div>
              )}
            </div>

            {materials.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-900/60 flex justify-end">
                <button
                  id="btn-clear-db"
                  onClick={clearDatabase}
                  className="text-[10px] text-slate-500 hover:text-red-400 transition"
                >
                  Limpar todos os registros
                </button>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: Label Customization & Designer Preview Screen */}
        <section className="lg:col-span-7 flex flex-col gap-6" id="right-column">
          
          {/* Card: Label Settings Controller */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5" id="settings-card">
            <h2 className="text-sm font-bold tracking-wider text-slate-300 uppercase mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-400" />
              Configuração Técnica da Impressão
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 font-medium">1. Formato da Bobina (Tamanho)</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setLabelSize("100x75")}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold transition flex flex-col items-center gap-1 ${
                      labelSize === "100x75" 
                        ? "bg-teal-500/5 border-teal-500/60 text-teal-300" 
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900"
                    }`}
                  >
                    <span>Grande: 100x75 mm</span>
                    <span className="text-[9px] font-normal opacity-70 font-mono">800 x 600 px térmico</span>
                  </button>

                  <button
                    onClick={() => setLabelSize("80x50")}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold transition flex flex-col items-center gap-1 ${
                      labelSize === "80x50" 
                        ? "bg-teal-500/5 border-teal-500/60 text-teal-300" 
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900"
                    }`}
                  >
                    <span>Compacto: 80x50 mm</span>
                    <span className="text-[9px] font-normal opacity-70 font-mono">640 x 400 px térmico</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1.5 font-medium">2. Ajustes Zebra GT800 (EPL)</label>
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 space-y-2.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Escuridade (Darkness): <strong className="text-teal-400 font-mono">{printerConfig.darkness}</strong></span>
                    <input
                      type="range"
                      min="0"
                      max="15"
                      value={printerConfig.darkness}
                      onChange={(e) => setPrinterConfig(prev => ({ ...prev, darkness: parseInt(e.target.value) }))}
                      className="w-24 accent-teal-500 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Velocidade (Speed): <strong className="text-teal-400 font-mono">{printerConfig.speed} pol/s</strong></span>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      value={printerConfig.speed}
                      onChange={(e) => setPrinterConfig(prev => ({ ...prev, speed: parseInt(e.target.value) }))}
                      className="w-24 accent-teal-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Visual Thermal Label Preview & Outputs */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 flex-1 flex flex-col" id="preview-section">
            
            {/* Header tab selectors */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-5 flex-wrap gap-2">
              <span className="text-sm font-bold tracking-wider text-slate-300 uppercase flex items-center gap-2">
                <Maximize2 className="w-4 h-4 text-teal-400" />
                Painel do Material Selecionado
              </span>

              <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  onClick={() => setActiveTab("visual")}
                  className={`px-3 py-1 rounded text-xs font-semibold transition ${
                    activeTab === "visual" ? "bg-slate-900 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Pré-visualização
                </button>
                <button
                  onClick={() => setActiveTab("epl")}
                  className={`px-3 py-1 rounded text-xs font-semibold transition ${
                    activeTab === "epl" ? "bg-slate-900 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Código EPL2
                </button>
                <button
                  onClick={() => setActiveTab("guia")}
                  className={`px-3 py-1 rounded text-xs font-semibold transition ${
                    activeTab === "guia" ? "bg-slate-900 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Manual de Impressão
                </button>
              </div>
            </div>

            {selectedRecord ? (
              <div className="flex-1 flex flex-col justify-between gap-6">
                
                {/* Visual Label Presentation Tab */}
                {activeTab === "visual" && (
                  <div className="flex-1 flex flex-col items-center justify-center py-6 bg-slate-950/50 rounded-lg border border-slate-800/40" id="visual-tab-content">
                    
                    {/* The virtual physical label representation! styled like standard shipping/inventory ribbons */}
                    <div 
                      className="bg-white text-black p-5 rounded font-mono border-2 border-black/10 shadow-2xl relative select-all flex flex-col justify-start shrink-0 mb-4"
                      style={{ 
                        width: labelSize === "100x75" ? "420px" : "360px", 
                        minHeight: labelSize === "100x75" ? "340px" : "280px"
                      }}
                    >
                      {/* Product Code & Description */}
                      <div className="mb-3">
                        <div className="text-[11px] leading-tight text-black/85">
                          <span className="font-bold">{labelSize === "100x75" ? "COD. MATERIAL:" : "COD:"} </span>
                          <span className="text-[15px] font-black tracking-wide">{selectedRecord.codigoMaterial}</span>
                        </div>

                        <div className="text-[10px] sm:text-[11px] font-extrabold uppercase line-clamp-2 mt-1 leading-snug">
                          {selectedRecord.descricao}
                        </div>
                      </div>

                      {/* Stacked Large Barcodes */}
                      <div className="flex flex-col gap-3.5 mt-2 w-full">
                        {/* EAN-13 top */}
                        <div className="w-full flex flex-col">
                          <div className="text-[9px] font-black uppercase text-black/70 mb-0.5">EAN:</div>
                          <div className="w-full bg-white flex justify-center">
                            <BarcodeSvg 
                              value={selectedRecord.ean} 
                              width={labelSize === "100x75" ? 360 : 310} 
                              height={labelSize === "100x75" ? 65 : 55} 
                            />
                          </div>
                        </div>

                        {/* LOTE bottom */}
                        <div className="w-full flex flex-col">
                          <div className="text-[9px] font-black uppercase text-black/70 mb-0.5">LOTE:</div>
                          <div className="w-full bg-white flex justify-center">
                            <BarcodeSvg 
                              value={selectedRecord.lote} 
                              width={labelSize === "100x75" ? 360 : 310} 
                              height={labelSize === "100x75" ? 65 : 55} 
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="text-center text-slate-500 text-xs">
                      Simulação térmica realista do tamanho <strong className="text-slate-300">{labelSize === "100x75" ? "100x75mm" : "80x50mm"} (Horizontal)</strong>. 
                    </div>
                  </div>
                )}

                {/* EPL Code tab outputting clean EPL syntax */}
                {activeTab === "epl" && (
                  <div className="flex-1 flex flex-col font-mono text-xs space-y-3" id="epl-tab-content">
                    <div className="flex items-center justify-between bg-slate-950 px-4 py-2 border border-slate-800 rounded-lg">
                      <span className="text-slate-400 text-[11px] flex items-center gap-1.5 font-sans">
                        <FileText className="w-3.5 h-3.5 text-orange-400" />
                        Script Raw EPL2 para Zebra
                      </span>
                      <button 
                        id="btn-copy-epl"
                        onClick={handleCopyEpl}
                        className="text-[10px] font-sans flex items-center gap-1 px-2.5 py-1 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:text-white rounded transition"
                      >
                        {copied ? <Check className="w-3 h-3 text-teal-400" /> : <Copy className="w-3 h-3" />}
                        {copied ? "Copiado!" : "Copiar Código"}
                      </button>
                    </div>

                    <div className="flex-1 bg-slate-950 p-4 border border-slate-850 rounded-lg overflow-x-auto text-[11px] leading-relaxed max-h-[300px] text-teal-400 select-all">
                      <pre>{eplCode}</pre>
                    </div>

                    {/* Quick lines explainer */}
                    <div className="border border-slate-800 bg-slate-900/30 rounded-lg p-3 text-[10px] text-slate-400 space-y-1 font-sans">
                      <p className="font-semibold text-slate-300">Explicação do código gerado:</p>
                      <ul className="list-disc list-inside space-y-0.5">
                        <li><strong className="text-slate-300">N:</strong> Limpa o buffer de memória da impressora.</li>
                        <li><strong className="text-slate-300">q{labelSize === "100x75" ? "800" : "640"}:</strong> Define a largura horizontal da etiqueta em pontos térmicos.</li>
                        <li><strong className="text-slate-300">Q{labelSize === "100x75" ? "600" : "400"},24:</strong> Define o comprimento vertical e o gap do papel sensor.</li>
                        <li><strong className="text-slate-300">A... :</strong> Escreve o texto mapeando as coordenadas (X, Y) e a fonte da Zebra.</li>
                        <li><strong className="text-slate-300">B... :</strong> Desenha o código de barras padrão Code 128 (padrão '1' no EPL).</li>
                        <li><strong className="text-slate-300">P1:</strong> Dispara o comando físico para imprimir 1 cópia.</li>
                      </ul>
                    </div>
                  </div>
                )}

                {/* Guia de Impressão em Português */}
                {activeTab === "guia" && (
                  <div className="flex-1 space-y-4 text-xs leading-relaxed max-h-[380px] overflow-y-auto pr-1" id="guia-tab-content">
                    <div className="bg-teal-500/5 border border-teal-500/20 p-3.5 rounded-lg flex items-start gap-3">
                      <Info className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-bold text-white mb-1">Como enviar o código EPL para a Zebra GT800?</h4>
                        <p className="text-slate-400">
                          A impressora Zebra GT800 se comunica nativamente por EPL ou ZPL. No Brasil, o EPL2 é muito comum para envio direto por portas USB/Serial. Abaixo estão as 3 melhores alternativas para impressão:
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3 font-sans">
                      <div className="border border-slate-800 bg-slate-950/60 rounded-lg p-3">
                        <span className="font-bold text-white flex items-center gap-1.5 mb-1.5">
                          <span className="w-4 h-4 bg-slate-900 border border-slate-700 text-[10px] flex items-center justify-center rounded">1</span>
                          Modo Direto via Navegador Chrome / Firefox (Recomendado)
                        </span>
                        <p className="text-slate-400 mb-2">
                          Utiliza a imagem de alta definição gerada pela página. Clique no botão de imprimir, selecione a sua impressora Zebra e defina o tamanho customizado (100x75 ou 80x50) nas configurações avançadas do driver.
                        </p>
                      </div>

                      <div className="border border-slate-800 bg-slate-950/60 rounded-lg p-3">
                        <span className="font-bold text-white flex items-center gap-1.5 mb-1.5">
                          <span className="w-4 h-4 bg-slate-900 border border-slate-700 text-[10px] flex items-center justify-center rounded">2</span>
                          Via Software "Zebra Setup Utilities"
                        </span>
                        <p className="text-slate-400">
                          Abra o utilitário oficial da Zebra, selecione a impressora carregada no Windows, vá em <strong className="text-slate-200">"Open Communication with Printer"</strong>, cole o código EPL2 gerado na aba ao lado e clique em <strong className="text-slate-200">"Send to Printer"</strong>.
                        </p>
                      </div>

                      <div className="border border-slate-800 bg-slate-950/60 rounded-lg p-3">
                        <span className="font-bold text-white flex items-center gap-1.5 mb-1.5">
                          <span className="w-4 h-4 bg-slate-900 border border-slate-700 text-[10px] flex items-center justify-center rounded">3</span>
                          Terminal de Comando (Script em lote)
                        </span>
                        <p className="text-slate-400">
                          Você pode baixar o arquivo <code className="bg-slate-900 text-teal-400 px-1 py-0.5 rounded font-mono">.epl</code> da etiqueta e enviá-lo via terminal de comando para a porta mapeada da impressora:
                        </p>
                        <pre className="bg-slate-900 text-slate-300 font-mono text-[10px] p-2 mt-2 rounded border border-slate-800">
                          copy zebralabel.epl LPT1: <br />
                          copy zebralabel.epl \\localhost\Zebra_GT800
                        </pre>
                      </div>
                    </div>
                  </div>
                )}

                {/* Print/Download primary triggers */}
                <div className="flex flex-col sm:flex-row gap-2.5 pt-4 border-t border-slate-800/80">
                  <button
                    id="btn-print-active"
                    onClick={handlePrintBrowser}
                    className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-bold rounded-lg shadow-lg hover:shadow-teal-500/20 shadow-teal-500/10 transition cursor-pointer"
                  >
                    <Printer className="w-4.5 h-4.5" />
                    Imprimir via Navegador
                  </button>

                  <button
                    id="btn-download-epl"
                    onClick={handleDownloadEplFile}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 hover:text-white rounded-lg transition"
                  >
                    <Download className="w-4 h-4" />
                    Arquivo .EPL
                  </button>
                  
                  <button
                    id="btn-copy-epl-secondary"
                    onClick={handleCopyEpl}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 hover:text-white rounded-lg transition"
                  >
                    {copied ? <Check className="w-4 h-4 text-teal-400" /> : <Copy className="w-4 h-4" />}
                    {copied ? "Copiado!" : "Copiar EPL2"}
                  </button>
                </div>

              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-slate-800 rounded-lg">
                <Printer className="w-12 h-12 text-slate-700 mb-3" />
                <p className="text-slate-400 font-medium text-xs">Nenhum material selecionado para exibição</p>
                <p className="text-slate-500 text-[11px] mt-1">Insira um termo de busca ao lado ou importe um arquivo .csv</p>
              </div>
            )}
          </div>
        </section>

      </main>

      {/* Footer bar */}
      <footer className="border-t border-slate-900 bg-slate-950 py-5 px-6 mt-auto text-center" id="app-footer-info">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <div className="text-slate-400">
            © {new Date().getFullYear()} – Gerador de Etiquetas EPL Zebra GT800
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-teal-400 inline-block" /> Offline Ready
            </span>
            <span className="text-slate-600">|</span>
            <span>Estilo de Código EPL2 Nativo</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
