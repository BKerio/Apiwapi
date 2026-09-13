import ExcelJS from 'exceljs';
import type { ReportsOverview } from '@/types/api';
import { downloadBlob } from '@/lib/downloadBlob';

const HEADER_FONT = { bold: true } as const;

/** Builds a multi-sheet .xlsx workbook from a reports overview payload and triggers a browser download. */
export async function exportReportToExcel(report: ReportsOverview): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Push Notification Platform';
  wb.created = new Date();

  const summary = wb.addWorksheet('Summary');
  summary.columns = [
    { header: 'Metric', key: 'metric', width: 28 },
    { header: 'Value', key: 'value', width: 18 },
  ];
  summary.addRows([
    { metric: 'Report range', value: `${report.range.from} to ${report.range.to}` },
    { metric: 'Total members', value: report.totals.members },
    { metric: 'Subscribed members', value: report.totals.subscribedMembers },
    { metric: 'Groups', value: report.totals.groups },
    { metric: 'Campaigns (all-time)', value: report.totals.campaigns },
    { metric: 'Messages sent (all-time)', value: report.totals.messagesSent },
    { metric: 'Messages failed (all-time)', value: report.totals.messagesFailed },
  ]);
  summary.getRow(1).font = HEADER_FONT;

  const trend = wb.addWorksheet('Campaigns Over Time');
  trend.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Campaigns', key: 'campaigns', width: 12 },
    { header: 'Sent', key: 'sent', width: 10 },
    { header: 'Failed', key: 'failed', width: 10 },
  ];
  trend.addRows(report.campaignsOverTime);
  trend.getRow(1).font = HEADER_FONT;

  const audience = wb.addWorksheet('Audience Breakdown');
  audience.columns = [
    { header: 'Audience', key: 'audience', width: 18 },
    { header: 'Campaigns', key: 'count', width: 12 },
  ];
  audience.addRows(report.audienceBreakdown);
  audience.getRow(1).font = HEADER_FONT;

  const delivery = wb.addWorksheet('Delivery Breakdown');
  delivery.columns = [
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Messages', key: 'count', width: 12 },
  ];
  delivery.addRows(report.deliveryBreakdown);
  delivery.getRow(1).font = HEADER_FONT;

  const groups = wb.addWorksheet('Members By Group');
  groups.columns = [
    { header: 'Group', key: 'group', width: 24 },
    { header: 'Members', key: 'count', width: 12 },
  ];
  groups.addRows(report.membersByGroup);
  groups.getRow(1).font = HEADER_FONT;

  const campaigns = wb.addWorksheet('Recent Campaigns');
  campaigns.columns = [
    { header: 'Name', key: 'name', width: 28 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Audience', key: 'audience', width: 14 },
    { header: 'Recipients', key: 'totalRecipients', width: 12 },
    { header: 'Sent', key: 'sentCount', width: 10 },
    { header: 'Failed', key: 'failedCount', width: 10 },
    { header: 'Created', key: 'createdAt', width: 20 },
  ];
  campaigns.addRows(report.recentCampaigns.map((c) => ({ ...c, createdAt: new Date(c.createdAt).toLocaleString() })));
  campaigns.getRow(1).font = HEADER_FONT;

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(blob, `push-report_${report.range.from}_to_${report.range.to}.xlsx`);
}
