import ExcelJS from "exceljs";
import type { DataTableColumn } from "../types";
import { getNestedValue } from "./nested";

/**
 * Export data to CSV or XLSX format
 */
export async function exportData<T>(
  rows: T[],
  columns: DataTableColumn<T>[],
  format: "csv" | "xlsx",
  visibleColumnKeys?: Set<string>
): Promise<void> {
  const exportColumns = columns.filter(
    (col) =>
      col.hideable !== false &&
      (!visibleColumnKeys || visibleColumnKeys.has(col.key))
  );

  // Build data array
  const exportRows = rows.map((row) => {
    const exportRow: Record<string, any> = {};
    for (const col of exportColumns) {
      const value = getNestedValue(row, col.key);
      exportRow[col.title] = col.exportValue
        ? col.exportValue({ row, value })
        : value;
    }
    return exportRow;
  });

  if (format === "csv") {
    exportCSV(exportRows, exportColumns);
  } else {
    await exportXLSX(exportRows, exportColumns);
  }
}

function escapeCSVValue(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }
  const stringValue = String(value);
  // Escape double quotes and wrap in quotes if contains comma, newline, or quote
  if (
    stringValue.includes(",") ||
    stringValue.includes("\n") ||
    stringValue.includes('"')
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function exportCSV<T>(
  rows: Record<string, any>[],
  columns: DataTableColumn<T>[]
): void {
  const headers = columns.map((c) => escapeCSVValue(c.title));
  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      columns.map((col) => escapeCSVValue(row[col.title])).join(",")
    ),
  ].join("\n");

  downloadFile(csvContent, "export.csv", "text/csv;charset=utf-8;");
}

async function exportXLSX<T>(
  rows: Record<string, any>[],
  columns: DataTableColumn<T>[]
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");

  // Headers with styling
  const headers = columns.map((c) => c.title);
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
  };

  // Data rows
  for (const row of rows) {
    sheet.addRow(headers.map((h) => row[h]));
  }

  // Auto-width columns
  sheet.columns.forEach((col) => {
    let maxLength = col.header?.toString().length || 10;
    col.eachCell?.({ includeEmpty: true }, (cell) => {
      const cellLength = cell.value?.toString().length || 0;
      if (cellLength > maxLength) {
        maxLength = cellLength;
      }
    });
    col.width = Math.min(maxLength + 2, 50);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  downloadFile(
    buffer,
    "export.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

function downloadFile(
  content: string | ArrayBuffer,
  filename: string,
  mimeType: string
): void {
  const blob =
    content instanceof ArrayBuffer
      ? new Blob([content], { type: mimeType })
      : new Blob([content], { type: mimeType });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
