import { MigrationInterface, QueryRunner } from 'typeorm';

const PREVIOUS_RULE = '.summary{width:350px;max-width:350px;';
const ALIGNED_RULE = '.summary{margin-left:auto;width:350px;max-width:350px;';

/** Keep totals on the right when the optional balance block is removed. */
export class ClassicDocumentTotalsAlignment1793441000000 implements MigrationInterface {
  name = 'ClassicDocumentTotalsAlignment1793441000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.replaceRule(queryRunner, PREVIOUS_RULE, ALIGNED_RULE);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await this.replaceRule(queryRunner, ALIGNED_RULE, PREVIOUS_RULE);
  }

  private async replaceRule(queryRunner: QueryRunner, previous: string, next: string): Promise<void> {
    await queryRunner.query(
      `UPDATE "document_template_items" AS item
       SET "content" = replace(item."content", $1, $2), "updatedAt" = now()
       FROM "document_templates" AS pack
       WHERE item."templateId" = pack."id" AND pack."code" = 'classic'
         AND item."documentType" IN ('SALE_INVOICE', 'PURCHASE_INVOICE', 'SALE_ORDER')
         AND strpos(item."content", $1) > 0`,
      [previous, next],
    );
  }
}
