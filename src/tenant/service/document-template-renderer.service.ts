import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  applyPrintThemeToHtml,
  formatDocumentDate,
  formatPrintedAt,
  resolveTimezoneFromIp,
} from 'src/common/pdf';
import {
  DocumentTemplate,
  DocumentTemplateStatus,
} from 'src/master-db/entities/document-template.entity';
import {
  DocumentTemplateDocumentType,
  DocumentTemplateSourceType,
} from 'src/master-db/entities/document-template-item.entity';
import { BusinessSettings } from 'src/tenant-db/entities/business-settings.entity';
import { MasterTenantDataService } from './master-tenant-data.service';
import { PrintThemeService } from './print-theme.service';

@Injectable()
export class DocumentTemplateRendererService {
  constructor(
    @InjectRepository(DocumentTemplate)
    private readonly documentTemplateRepository: Repository<DocumentTemplate>,
    private readonly printThemeService: PrintThemeService,
    private readonly masterTenantDataService: MasterTenantDataService,
  ) {}

  async render(
    tenantDb: DataSource,
    businessId: string,
    documentType: DocumentTemplateDocumentType,
    data: Record<string, unknown>,
    tenantId?: string | null,
    clientIp?: string | null,
  ): Promise<string> {
    const settings = await tenantDb.getRepository(BusinessSettings).findOne({
      where: { businessId },
      select: ['defaultDocumentTemplateId'],
    });
    const templateId = settings?.defaultDocumentTemplateId;
    if (!templateId) {
      throw new NotFoundException('No document template is selected for this business');
    }

    const [pack, themeColors, timeZone] = await Promise.all([
      this.documentTemplateRepository.findOne({
        where: { id: templateId, status: DocumentTemplateStatus.ACTIVE },
        relations: { items: true },
      }),
      this.printThemeService.resolveForTenant(tenantId),
      this.resolveTimeZone(tenantId, clientIp),
    ]);
    if (!pack) {
      throw new NotFoundException('The selected document template is not active');
    }

    const item = pack.items?.find((candidate) =>
      candidate.documentType === documentType && candidate.isActive,
    );
    if (!item) {
      throw new NotFoundException(`No active ${documentType} sub-template is available`);
    }

    if (item.sourceType === DocumentTemplateSourceType.FILE) {
      const fileUrl = String(item.fileUrl ?? '').trim();
      if (!fileUrl) {
        throw new NotFoundException(`The ${documentType} sub-template file is missing`);
      }
      return applyPrintThemeToHtml(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>@page{size:A4;margin:0}html,body,iframe{width:100%;height:100%;margin:0;border:0}</style></head><body><iframe src="${escapeHtml(fileUrl)}"></iframe></body></html>`,
        themeColors,
      );
    }

    const content = String(item.content ?? '').trim();
    if (!content) {
      throw new NotFoundException(`The ${documentType} sub-template content is empty`);
    }

    const printedOn = formatDocumentDate(new Date(), timeZone);
    const printedAt = formatPrintedAt(new Date(), timeZone);

    return applyPrintThemeToHtml(
      applyPrintedOn(
        renderDocumentTemplate(
          content,
          {
            ...data,
            theme: themeColors,
            primaryColor: themeColors.primary,
            primary_color: themeColors.primary,
            printedOn,
            printed_on: printedOn,
            printedAt,
            printed_at: printedAt,
          },
          timeZone,
        ),
        printedOn,
      ),
      themeColors,
    );
  }

  private async resolveTimeZone(
    tenantId?: string | null,
    clientIp?: string | null,
  ): Promise<string> {
    const tenantSettings =
      await this.masterTenantDataService.getTenantSettingsByTenantId(tenantId);
    const fallback =
      tenantSettings?.timezone?.trim() &&
      tenantSettings.timezone.trim().toUpperCase() !== 'UTC'
        ? tenantSettings.timezone.trim()
        : 'Asia/Karachi';
    return resolveTimezoneFromIp(clientIp, fallback);
  }
}

const escapeHtml = (value: unknown): string =>
  String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);

const TEMPLATE_LOGO_MARKER = '\u0000DOCUMENT_TEMPLATE_COMPANY_LOGO\u0000';
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr',
]);
const BALANCE_LABEL_PATTERN = /\b(?:(?:previous|current|opening|closing|account|customer|vendor|party|outstanding|remaining)\s+balance|balance\s+(?:due|brought\s+forward|carried\s+forward)|this\s+bill|balance\s+[b/c]\/f)\b/i;
const BALANCE_LABEL_PATTERN_GLOBAL = /\b(?:(?:previous|current|opening|closing|account|customer|vendor|party|outstanding|remaining)\s+balance|balance\s+(?:due|brought\s+forward|carried\s+forward)|this\s+bill|balance\s+[b/c]\/f)\b/gi;
const BALANCE_TOKEN_PATTERN = /\{\{\s*[^{}]*(?:balance|this[_\s]?bill)[^{}]*\s*\}\}/i;
const BALANCE_TOKEN_PATTERN_GLOBAL = /\{\{\s*[^{}]*(?:balance|this[_\s]?bill)[^{}]*\s*\}\}/gi;

const isBalanceOnlyMarkupText = (rawText: string): boolean => {
  const text = String(rawText || '').replace(/&nbsp;|&#160;/gi, ' ');
  if (!BALANCE_LABEL_PATTERN.test(text) && !BALANCE_TOKEN_PATTERN.test(text)) return false;

  const remaining = text
    .replace(BALANCE_LABEL_PATTERN_GLOBAL, ' ')
    .replace(BALANCE_TOKEN_PATTERN_GLOBAL, ' ')
    .replace(/\{\{[^{}]*\}\}/g, ' ')
    .replace(/\b(?:PKR|Rs\.?|USD|EUR|GBP|AED|SAR|QAR|INR|BDT|CR|DR)\b/gi, ' ')
    .replace(/[\p{N}\s.,:;()\-–—+/$₹₨€£%]/gu, '');
  return remaining.length === 0;
};

const removeBalanceFieldMarkup = (markup: string): string => {
  type HtmlNode = { tag: string; start: number; end: number; text: string; parent: HtmlNode | null };
  const nodes: HtmlNode[] = [];
  const stack: HtmlNode[] = [];
  const tagPattern = /<!--[\s\S]*?-->|<[^>]+>/g;
  const appendText = (text: string) => {
    if (!text || stack.some((node) => node.tag === 'script' || node.tag === 'style')) return;
    for (const node of stack) node.text += text;
  };

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(markup))) {
    appendText(markup.slice(lastIndex, match.index));
    lastIndex = tagPattern.lastIndex;
    const tagToken = match[0];
    const parsedTag = tagToken.match(/^<\/?\s*([a-zA-Z][\w:-]*)/);
    if (!parsedTag || tagToken.startsWith('<!--') || tagToken.startsWith('<!')) continue;

    const tag = parsedTag[1].toLowerCase();
    if (/^<\//.test(tagToken)) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].tag !== tag) continue;
        for (let closeIndex = stack.length - 1; closeIndex >= index; closeIndex -= 1) {
          stack[closeIndex].end = tagPattern.lastIndex;
        }
        stack.length = index;
        break;
      }
      continue;
    }

    const node: HtmlNode = {
      tag,
      start: match.index,
      end: tagPattern.lastIndex,
      text: '',
      parent: stack[stack.length - 1] || null,
    };
    nodes.push(node);
    if (!VOID_TAGS.has(tag) && !/\/\s*>$/.test(tagToken)) stack.push(node);
  }
  appendText(markup.slice(lastIndex));
  for (const node of stack) node.end = markup.length;

  const removableTags = new Set([
    'tr', 'td', 'th', 'div', 'p', 'li', 'section', 'article', 'aside',
    'dl', 'dd', 'dt', 'fieldset', 'span',
  ]);
  const eligible = nodes.filter((node) =>
    removableTags.has(node.tag) && isBalanceOnlyMarkupText(node.text),
  );
  const eligibleSet = new Set(eligible);
  const roots = eligible.filter((node) => {
    let parent = node.parent;
    while (parent) {
      if (eligibleSet.has(parent)) return false;
      parent = parent.parent;
    }
    return true;
  });

  return roots
    .sort((left, right) => right.start - left.start)
    .reduce((content, node) => content.slice(0, node.start) + content.slice(node.end), markup);
};

const getCompanyLogoMarkup = (data: Record<string, unknown>): string => {
  const companyInfo = data.companyInfo as Record<string, unknown> | undefined;
  const source = String(
    companyInfo?.logo || companyInfo?.businessLogo || companyInfo?.business_logo || companyInfo?.logoUrl || '',
  ).trim();
  if (!/^(?:https?:\/\/|blob:|data:image\/[a-z0-9.+-]+(?:;[^,]*)?,|\/(?!\/))/i.test(source)) {
    return '';
  }

  const name = escapeHtml(companyInfo?.name || companyInfo?.businessName || 'Business logo');
  return `<img src="${escapeHtml(source)}" alt="${name}" style="display:block;width:auto;height:auto;max-width:128px;max-height:72px;object-fit:contain;margin:0 auto;" />`;
};

const formatTemplateValue = (
  value: unknown,
  timeZone: string,
): string => {
  if (value == null) return '';
  if (value instanceof Date) {
    return formatDocumentDate(value, timeZone);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (
      /^\d{4}-\d{2}-\d{2}/.test(trimmed) ||
      /GMT[+-]\d{4}/i.test(trimmed) ||
      /Coordinated Universal Time/i.test(trimmed)
    ) {
      return formatDocumentDate(trimmed, timeZone) || trimmed;
    }
  }
  return String(value);
};

const applyPrintedOn = (html: string, printedOn: string): string =>
  html.replace(
    /Printed On:<\/strong>\s*[^<]*/gi,
    `Printed On:</strong> ${escapeHtml(printedOn)}`,
  );

const renderDocumentTemplate = (
  content: string,
  data: Record<string, unknown>,
  timeZone: string,
): string => {
  const logoMarkup = getCompanyLogoMarkup(data);
  const hasExplicitLogoBinding = /\{\{\s*(?:companyInfo\.)?(?:logo|businessLogo|business_logo|logoUrl)\s*\}\}/i.test(content);
  const companyInfo = data.companyInfo as Record<string, unknown> | undefined;
  const initials = String(companyInfo?.initials || '').trim()
    || String(companyInfo?.name || companyInfo?.businessName || '').trim()
      .split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
  const brandMarkup = logoMarkup && !hasExplicitLogoBinding
    ? logoMarkup
    : escapeHtml(initials);
  let templateContent = content;
  if (data.showBalanceDetails === false) {
    templateContent = removeBalanceFieldMarkup(templateContent);
  }
  templateContent = templateContent.replace(
    /\{\{\s*companyInfo\.initials\s*\}\}/gi,
    TEMPLATE_LOGO_MARKER,
  );

  const readPath = (path: string, scope: Record<string, unknown>): unknown =>
    path.split('.').filter(Boolean).reduce<unknown>((current, key) => {
      if (current == null || typeof current !== 'object') return undefined;
      return (current as Record<string, unknown>)[key];
    }, scope);

  const interpolate = (
    markup: string,
    scope: Record<string, unknown>,
    itemIndex: number | null = null,
  ): string => markup.replace(
    /\{\{\s*(@index|[a-zA-Z0-9_.]+)\s*\}\}/g,
    (_match, path: string) => {
      if (path === '@index') return itemIndex == null ? '' : String(itemIndex);
      const value = readPath(path.startsWith('this.') ? path.slice(5) : path, scope);
      return value == null ? '' : escapeHtml(formatTemplateValue(value, timeZone));
    },
  );

  const blocks: Array<{ path: string; markup: string }> = [];
  const markedContent = templateContent.replace(
    /\{\{#each\s+([a-zA-Z0-9_.]+)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g,
    (_match, path: string, markup: string) => `\u0000DOCUMENT_TEMPLATE_EACH_${blocks.push({ path, markup }) - 1}\u0000`,
  );
  const interpolated = interpolate(markedContent, data);
  const filled = interpolated.replace(
    /\u0000DOCUMENT_TEMPLATE_EACH_(\d+)\u0000/g,
    (_match, blockIndex: string) => {
      const block = blocks[Number(blockIndex)];
      const rows = block ? readPath(block.path, data) : null;
      if (!block || !Array.isArray(rows)) return '';
      return rows.map((row, index) => {
        const rowData = row && typeof row === 'object'
          ? row as Record<string, unknown>
          : { value: row };
        return interpolate(
          block.markup,
          { ...data, ...rowData, item: row, this: row, lineNumber: index + 1 },
          index,
        );
      }).join('');
    },
  );
  const contentWithLogo = filled.replaceAll(TEMPLATE_LOGO_MARKER, brandMarkup);

  if (/<html[\s>]/i.test(contentWithLogo)) return contentWithLogo;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>@page{size:A4;margin:0}html,body{margin:0;min-height:100%;background:#fff;font-family:Arial,sans-serif}</style></head><body>${contentWithLogo}</body></html>`;
};

