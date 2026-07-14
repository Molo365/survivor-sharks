import jsPDF from "jspdf";
import { autoTable } from "jspdf-autotable";

export interface GridPdfOptions {
  filename: string;
  poolName: string;
  sport: string;
  subtitle: string;
  columns: string[];
  rows: { cells: string[]; isCurrentUser?: boolean }[];
  footer: string;
  cellColorFn?: (rowIdx: number, colIdx: number, text: string) => [number, number, number] | null;
}

const MLB_TEAM_COLORS: Record<string, string> = {
  // AL East
  NYY: "#003087", BOS: "#BD3039", TOR: "#134A8E",
  BAL: "#DF4601", TB: "#092C5C",
  // AL Central
  CLE: "#00385D", CHW: "#27251F", DET: "#0C2340",
  KC: "#004687", MIN: "#002B5C",
  // AL West
  HOU: "#002D62", LAA: "#BA0021", OAK: "#003831",
  SEA: "#0C2C56", TEX: "#003278", ATH: "#003831",
  // NL East
  NYM: "#002D72", PHI: "#E81828", ATL: "#CE1141",
  MIA: "#00A3E0", WSH: "#AB0003",
  // NL Central
  CHC: "#0E3386", CIN: "#C6011F", MIL: "#FFC52F",
  PIT: "#FDB827", STL: "#C41E3A",
  // NL West
  LAD: "#005A9C", SF: "#FD5A1E", SD: "#2F241D",
  COL: "#333366", ARI: "#A71930",
};

function blendWithWhite(hex: string, alpha: number): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [
    Math.round(r * alpha + 255 * (1 - alpha)),
    Math.round(g * alpha + 255 * (1 - alpha)),
    Math.round(b * alpha + 255 * (1 - alpha)),
  ];
}

export function downloadGridPdf({
  filename,
  poolName,
  sport,
  subtitle,
  columns,
  rows,
  footer,
  cellColorFn,
}: GridPdfOptions): void {
  const doc = new jsPDF({ orientation: "landscape", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const availableWidth = pageWidth - 20;
  const playerColWidth = 38;
  const gameColWidth = (availableWidth - playerColWidth) / (columns.length - 1);
  const numCols = columns.length - 1;
  const fontSize = numCols <= 8 ? 8 : numCols <= 12 ? 7 : numCols <= 16 ? 6 : 5;

  const truncateHeader = (h: string): string => {
    if (gameColWidth < 12) return h.slice(0, 5);
    if (gameColWidth < 16) return h.slice(0, 7);
    return h;
  };

  const truncatedColumns = columns.map((h, i) => (i === 0 ? h : truncateHeader(h)));

  let y = 16;

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 80, 200);
  doc.text("SURVIVOR SHARKS", margin, y);
  y += 9;

  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 20, 40);
  doc.text(poolName.toUpperCase(), margin, y);
  y += 8;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 120);
  doc.text(`${sport}  ·  ${subtitle}`, margin, y);
  y += 5;

  doc.setDrawColor(200, 205, 220);
  doc.setLineWidth(0.4);
  doc.line(margin, y, pageWidth - margin, y);
  y += 4;

  const lastCol = columns.length - 1;
  const gameColEntries = Array.from({ length: lastCol - 1 }, (_, i) => [
    String(i + 1),
    { halign: "center" as const, cellWidth: gameColWidth },
  ]);
  const columnStyles = {
    "0": { halign: "left" as const, fontStyle: "bold" as const, cellWidth: playerColWidth },
    ...Object.fromEntries(gameColEntries),
    [String(lastCol)]: { halign: "right" as const, fontStyle: "bold" as const, cellWidth: gameColWidth },
  };

  autoTable(doc, {
    startY: y,
    head: [truncatedColumns],
    body: rows.map((r) => r.cells),
    tableWidth: availableWidth,
    margin: { left: margin, right: margin, bottom: 16 },
    styles: {
      fontSize,
      cellPadding: 1.5,
      halign: "center",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [15, 23, 42] as [number, number, number],
      textColor: [255, 255, 255] as [number, number, number],
      fontStyle: "bold",
      halign: "center",
      fontSize,
    },
    bodyStyles: {
      textColor: [30, 30, 50] as [number, number, number],
    },
    alternateRowStyles: {
      fillColor: [246, 247, 252] as [number, number, number],
    },
    columnStyles,
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const colIdx = data.column.index;
      if (colIdx === 0 || colIdx === lastCol) return;

      const text = String(data.cell.raw ?? "").trim();
      if (!text || text === "—") return;

      const parts = text.split(" ");
      const abbrev = parts[0];
      const result = parts[1];

      const hex = abbrev ? MLB_TEAM_COLORS[abbrev] : undefined;
      const styles = data.cell.styles as unknown as Record<string, unknown>;
      if (hex) {
        styles.fillColor = blendWithWhite(hex, 0.2);
      }

      if (result === "W") {
        styles.textColor = [0, 120, 60];
      } else if (result === "L") {
        styles.textColor = [180, 30, 30];
      }

      if (cellColorFn) {
        const callerColor = cellColorFn(data.row.index, data.column.index, text);
        if (callerColor) styles.fillColor = callerColor;
      }
    },
  });

  const totalPages = doc.getNumberOfPages();
  const now = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 170);
    doc.text("Generated by Survivor Sharks", margin, pageH - 8);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageH - 8, { align: "center" });
    doc.text(now, pageWidth - margin, pageH - 8, { align: "right" });
    doc.setFontSize(7);
    doc.text(footer, pageWidth / 2, pageH - 4, { align: "center" });
  }

  doc.save(filename);
}
