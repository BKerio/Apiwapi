import ExcelJS from 'exceljs';
import type { Member } from '@/types/api';
import { downloadBlob } from '@/lib/downloadBlob';

/** Builds a single-sheet .xlsx of members and triggers a browser download. */
export async function exportMembersToExcel(members: Member[], filenameSuffix = ''): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Push Notification Platform';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Members');
  sheet.columns = [
    { header: 'Name', key: 'name', width: 26 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'Email', key: 'email', width: 26 },
    { header: 'Groups', key: 'groups', width: 26 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Onboarded', key: 'createdAt', width: 18 },
  ];
  sheet.addRows(members.map((m) => ({
    name: m.name,
    phone: m.phone,
    email: m.email || '',
    groups: m.groups.map((g) => g.name).join(', '),
    status: m.isSubscribed ? 'Subscribed' : 'Opted out',
    createdAt: new Date(m.createdAt).toLocaleDateString(),
  })));
  sheet.getRow(1).font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(blob, `members${filenameSuffix}.xlsx`);
}
