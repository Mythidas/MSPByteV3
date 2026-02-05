import ExcelJS from 'exceljs';
import type { RequestHandler } from './$types';
import type { ReconciliationReport, SiteReport } from '../types';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const report: ReconciliationReport = await request.json();

    const workbook = buildWorkbook(report.sites);
    const buffer = await workbook.xlsx.writeBuffer();

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="reconciliation-report.xlsx"`,
      },
    });
  } catch (error) {
    console.error('Error exporting report:', error);
    return new Response(JSON.stringify({ error: 'Export failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

function buildWorkbook(sites: SiteReport[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();

  const summary = workbook.addWorksheet('Reconciliation Summary');
  summary.columns = [
    { header: 'Customer', key: 'customer', width: 35 },
    { header: 'Contract Servers', key: 'contract_servers', width: 18 },
    { header: 'Contract Desktops', key: 'contract_desktops', width: 18 },
    { header: 'Contract Backups', key: 'contract_backups', width: 18 },
    { header: 'Sophos Servers', key: 'sophos_servers', width: 18 },
    { header: 'Sophos Desktops', key: 'sophos_desktops', width: 18 },
    { header: 'Datto Servers', key: 'datto_servers', width: 18 },
    { header: 'Datto Desktops', key: 'datto_desktops', width: 18 },
    { header: 'Cove Devices', key: 'cove_devices', width: 18 },
  ];

  // Style header row
  const headerRow = summary.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };

  for (const site of sites) {
    const row = summary.addRow({
      customer: site.name,
      contract_servers: site.contract.servers,
      contract_desktops: site.contract.desktops,
      contract_backups: site.contract.backups,
      sophos_servers: site.sophos.servers,
      sophos_desktops: site.sophos.desktops,
      datto_servers: site.datto.servers,
      datto_desktops: site.datto.desktops,
      cove_devices: site.cove.devices,
    });

    const sophosServerMismatch = site.sophos.servers !== site.contract.servers;
    const sophosDesktopMismatch = site.sophos.desktops !== site.contract.desktops;
    const dattoServerMismatch = site.datto.servers !== site.contract.servers;
    const dattoDesktopMismatch = site.datto.desktops !== site.contract.desktops;
    const coveDeviceMismatch = site.cove.devices !== site.contract.backups;
    const anyMismatch =
      sophosServerMismatch ||
      dattoServerMismatch ||
      sophosDesktopMismatch ||
      dattoDesktopMismatch ||
      coveDeviceMismatch;

    // Highlight customer name if any mismatch
    if (anyMismatch) {
      row.getCell('customer').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF4CCCC' },
      };
    }

    const warningFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFF2CC' },
    };

    const overFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF4CCCC' },
    };

    // Highlight mismatched cells with direction-based colors
    if (sophosServerMismatch) {
      row.getCell('sophos_servers').fill =
        site.sophos.servers > site.contract.servers ? overFill : warningFill;
    }
    if (sophosDesktopMismatch) {
      row.getCell('sophos_desktops').fill =
        site.sophos.desktops > site.contract.desktops ? overFill : warningFill;
    }
    if (dattoServerMismatch) {
      row.getCell('datto_servers').fill =
        site.datto.servers > site.contract.servers ? overFill : warningFill;
    }
    if (dattoDesktopMismatch) {
      row.getCell('datto_desktops').fill =
        site.datto.desktops > site.contract.desktops ? overFill : warningFill;
    }
    if (coveDeviceMismatch) {
      row.getCell('cove_devices').fill =
        site.cove.devices > site.contract.backups ? overFill : warningFill;
    }
  }

  return workbook;
}
