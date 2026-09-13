import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import type { ReportsOverview } from '@/types/api';

const MARGIN = 40;
const BRAND_RGB: [number, number, number] = [30, 58, 138]; // matches --green (the app's brand blue)

/** Reads the finalY position jspdf-autotable leaves on the doc instance - not part of jsPDF's own type, hence the cast. */
function lastTableEndY(doc: jsPDF, fallback: number): number {
  const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY;
  return typeof finalY === 'number' ? finalY : fallback;
}

/**
 * Renders a PDF report: a summary table, a rasterized snapshot of the
 * on-screen charts (so the pies/graphs show up as-is), and a recent-campaigns
 * table - then triggers a browser download.
 */
export async function exportReportToPdf(report: ReportsOverview, chartsEl: HTMLElement | null): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = MARGIN;

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Push Notification Report', MARGIN, y);
  y += 18;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(110);
  doc.text(`Range: ${report.range.from} to ${report.range.to}  ·  Generated ${new Date().toLocaleString()}`, MARGIN, y);
  doc.setTextColor(0);
  y += 20;

  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['Total members', String(report.totals.members)],
      ['Subscribed members', String(report.totals.subscribedMembers)],
      ['Groups', String(report.totals.groups)],
      ['Campaigns (all-time)', String(report.totals.campaigns)],
      ['Messages sent (all-time)', String(report.totals.messagesSent)],
      ['Messages failed (all-time)', String(report.totals.messagesFailed)],
    ],
    theme: 'grid',
    headStyles: { fillColor: BRAND_RGB },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = lastTableEndY(doc, y) + 28;

  if (chartsEl) {
    const canvas = await html2canvas(chartsEl, { scale: 2, backgroundColor: '#ffffff' });
    let imgWidth = pageWidth - MARGIN * 2;
    let imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Start the charts section on a fresh page if it won't fit where we are.
    if (y + 40 > pageHeight - MARGIN || imgHeight > pageHeight - y - MARGIN - 20) {
      doc.addPage();
      y = MARGIN;
    }

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Charts', MARGIN, y);
    y += 14;

    // Scale down (preserving aspect ratio) rather than overflow the page if
    // the charts grid is still too tall even at the top of a fresh page.
    const availableHeight = pageHeight - y - MARGIN;
    if (imgHeight > availableHeight) {
      const scale = availableHeight / imgHeight;
      imgWidth *= scale;
      imgHeight = availableHeight;
    }

    doc.addImage(canvas.toDataURL('image/png'), 'PNG', MARGIN, y, imgWidth, imgHeight);
    y += imgHeight + 24;
  }

  if (y > pageHeight - 140) {
    doc.addPage();
    y = MARGIN;
  }
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Recent Campaigns', MARGIN, y);
  y += 8;

  autoTable(doc, {
    startY: y + 6,
    head: [['Name', 'Status', 'Audience', 'Recipients', 'Sent', 'Failed', 'Created']],
    body: report.recentCampaigns.map((c) => [
      c.name, c.status, c.audience, String(c.totalRecipients), String(c.sentCount), String(c.failedCount),
      new Date(c.createdAt).toLocaleDateString(),
    ]),
    theme: 'striped',
    headStyles: { fillColor: BRAND_RGB },
    styles: { fontSize: 8 },
    margin: { left: MARGIN, right: MARGIN },
  });

  doc.save(`push-report_${report.range.from}_to_${report.range.to}.pdf`);
}
