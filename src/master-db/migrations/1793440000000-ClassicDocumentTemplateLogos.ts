import { MigrationInterface, QueryRunner } from 'typeorm';

const STATIC_MARK = '<div class="brand-mark">EP</div>';
const DYNAMIC_MARK = '<div class="brand-mark">{{companyInfo.initials}}</div>';
const PAYSLIP_HEADER = '<header class="company">{{companyInfo.name}}</header>';
const PAYSLIP_HEADER_WITH_LOGO = '<header class="company"><span style="display:flex;align-items:center;justify-content:center;flex:none;width:76px;height:76px">{{companyInfo.initials}}</span><span>{{companyInfo.name}}</span></header>';

/** Bind saved Classic logo slots to the business instead of the sample initials. */
export class ClassicDocumentTemplateLogos1793440000000 implements MigrationInterface {
  name = 'ClassicDocumentTemplateLogos1793440000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.replaceContent(queryRunner, STATIC_MARK, DYNAMIC_MARK);
    await this.replaceContent(queryRunner, PAYSLIP_HEADER, PAYSLIP_HEADER_WITH_LOGO, 'PAYSLIP');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await this.replaceContent(queryRunner, DYNAMIC_MARK, STATIC_MARK);
    await this.replaceContent(queryRunner, PAYSLIP_HEADER_WITH_LOGO, PAYSLIP_HEADER, 'PAYSLIP');
  }

  private async replaceContent(
    queryRunner: QueryRunner,
    previous: string,
    next: string,
    documentType?: string,
  ): Promise<void> {
    await queryRunner.query(
      `UPDATE "document_template_items" AS item
       SET "content" = replace(item."content", $1, $2), "updatedAt" = now()
       FROM "document_templates" AS pack
       WHERE item."templateId" = pack."id" AND pack."code" = 'classic'
         AND strpos(item."content", $1) > 0
         AND ($3::text IS NULL OR item."documentType"::text = $3)`,
      [previous, next, documentType ?? null],
    );
  }
}
