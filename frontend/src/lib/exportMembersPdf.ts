import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { Member } from '@/types/api';

const MARGIN = 40;
const BRAND_RGB: [number, number, number] = [30, 58, 138]; // matches --green (the app's brand blue)

/** Renders a landscape member-list PDF (name/phone/email/groups/status) and triggers a browser download. */
export async function exportMembersToPdf(members: Member[], filters: { search?: string; groupName?: string } = {}): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  let y = MARGIN;

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Members', MARGIN, y);
  y += 18;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(110);
  const filterBits = [
    filters.groupName ? `Group: ${filters.groupName}` : null,
    filters.search ? `Search: "${filters.search}"` : null,
  ].filter(Boolean).join('  ·  ');
  doc.text(`${members.length} member(s)${filterBits ? `  ·  ${filterBits}` : ''}  ·  Generated ${new Date().toLocaleString()}`, MARGIN, y);
  doc.setTextColor(0);
  y += 16;

  autoTable(doc, {
    startY: y,
    head: [['Name', 'Phone', 'Email', 'Groups', 'Status', 'Onboarded']],
    body: members.map((m) => [
      m.name,
      m.phone,
      m.email || '-',
      m.groups.map((g) => g.name).join(', ') || '-',
      m.isSubscribed ? 'Subscribed' : 'Opted out',
      new Date(m.createdAt).toLocaleDateString(),
    ]),
    theme: 'striped',
    headStyles: { fillColor: BRAND_RGB },
    styles: { fontSize: 9 },
    margin: { left: MARGIN, right: MARGIN },
  });

  doc.save(`members${filters.groupName ? `_${filters.groupName}` : ''}.pdf`);
}
