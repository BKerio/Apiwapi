import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { AppContext } from '../../context.js';
import { normalizePhone } from './phone.js';
import { BadRequestError } from '../../shared/errors/AppError.js';

export interface ImportRowError {
  row: number;
  reason: string;
}

export interface ImportResult {
  created: number;
  skipped: number;
  errors: ImportRowError[];
}

/**
 * Bulk member onboarding from a CSV or XLSX file: expects `name,phone` columns
 * plus optional `email` and `groups` (comma/pipe-separated group names -
 * groups that don't exist yet are auto-created). Duplicate phone numbers,
 * whether already in the database or repeated within the file, are skipped
 * rather than overwriting an existing member.
 */
export class MemberImportService {
  constructor(private app: AppContext) {}

  async importFile(buffer: Buffer, filename: string, actorId: string): Promise<ImportResult> {
    const records = await this.parseRecords(buffer, filename);
    if (records.length === 0) throw new BadRequestError('The file has no rows');

    const errors: ImportRowError[] = [];
    const seenPhones = new Set<string>();
    const toCreate: { name: string; phone: string; email?: string; groupNames: string[] }[] = [];

    records.forEach((raw, idx) => {
      const row = idx + 2; // account for the header row
      const name = (raw.name ?? '').trim();
      const rawPhone = (raw.phone ?? '').trim();
      if (!name || !rawPhone) {
        errors.push({ row, reason: 'Missing name or phone' });
        return;
      }
      const phone = normalizePhone(rawPhone);
      if (!phone) {
        errors.push({ row, reason: `Invalid phone number "${rawPhone}"` });
        return;
      }
      if (seenPhones.has(phone)) {
        errors.push({ row, reason: `Duplicate phone number in file: ${phone}` });
        return;
      }
      seenPhones.add(phone);

      const email = (raw.email ?? '').trim() || undefined;
      const groupNames = [...new Set((raw.groups ?? '').split(/[,|]/).map((g) => g.trim()).filter(Boolean))];
      toCreate.push({ name, phone, email, groupNames });
    });

    if (toCreate.length === 0) return { created: 0, skipped: 0, errors };

    const existing = await this.app.prisma.member.findMany({
      where: { phone: { in: toCreate.map((r) => r.phone) } },
      select: { phone: true },
    });
    const existingPhones = new Set(existing.map((m) => m.phone));

    // Resolve/create every group named anywhere in the file up front, once each.
    const groupNamesNeeded = [...new Set(toCreate.flatMap((r) => r.groupNames))];
    const groupIdByName = new Map<string, string>();
    for (const name of groupNamesNeeded) {
      const group = await this.app.prisma.group.upsert({
        where: { name }, update: {}, create: { name }, select: { id: true },
      });
      groupIdByName.set(name, group.id);
    }

    let created = 0;
    let skipped = 0;
    for (const row of toCreate) {
      if (existingPhones.has(row.phone)) {
        skipped++;
        continue;
      }
      await this.app.prisma.member.create({
        data: {
          name: row.name, phone: row.phone, email: row.email, createdById: actorId,
          groupMemberships: row.groupNames.length
            ? { create: row.groupNames.map((g) => ({ groupId: groupIdByName.get(g)! })) }
            : undefined,
        },
      });
      created++;
    }

    await this.app.auditLog.record({
      actorId, action: 'CREATE', subjectType: 'MEMBER', subjectId: 'member-import',
      summary: `Imported ${created} member(s) from ${filename} (${skipped} skipped as duplicates, ${errors.length} row error(s))`,
    });

    return { created, skipped, errors };
  }

  /** Parses a CSV or XLSX buffer into rows keyed by lowercased, trimmed header. */
  private async parseRecords(buffer: Buffer, filename: string): Promise<Record<string, string>[]> {
    if (filename.toLowerCase().endsWith('.xlsx')) return this.parseXlsx(buffer);

    try {
      return parse(buffer, {
        columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
        skip_empty_lines: true,
        trim: true,
      });
    } catch {
      throw new BadRequestError('Could not parse the CSV file. Make sure it has name,phone,email,groups columns.');
    }
  }

  private async parseXlsx(buffer: Buffer): Promise<Record<string, string>[]> {
    const workbook = new ExcelJS.Workbook();
    try {
      // exceljs's own .d.ts shadows the name `Buffer` with a bare, non-Node
      // interface local to that module, so a Node Buffer never structurally
      // satisfies it under any cast to that name - route through `any`.
      await workbook.xlsx.load(buffer as any);
    } catch {
      throw new BadRequestError('Could not parse the Excel file. Make sure it is a valid .xlsx file.');
    }

    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestError('The Excel file has no sheets');

    let headers: string[] = [];
    const records: Record<string, string>[] = [];
    sheet.eachRow((row, rowNumber) => {
      // ExcelJS's row.values is 1-indexed (index 0 is always empty) - drop it.
      const values = (row.values as ExcelJS.CellValue[]).slice(1);
      const cells = values.map((v) => cellToString(v));

      if (rowNumber === 1) {
        headers = cells.map((h) => h.trim().toLowerCase());
        return;
      }
      if (cells.every((c) => c.trim() === '')) return; // skip blank rows

      const record: Record<string, string> = {};
      headers.forEach((h, i) => { record[h] = (cells[i] ?? '').trim(); });
      records.push(record);
    });

    return records;
  }
}

/** Renders one ExcelJS cell value as plain text - handles the rich-text/formula/date shapes cells can come back as. */
function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text; // hyperlink
    if ('richText' in value && Array.isArray(value.richText)) return value.richText.map((r) => r.text).join('');
    if ('result' in value) return cellToString(value.result as ExcelJS.CellValue); // formula
    return '';
  }
  return String(value);
}
