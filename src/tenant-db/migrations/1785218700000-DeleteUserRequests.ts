import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeleteUserRequests1785218700000 implements MigrationInterface {
  name = 'DeleteUserRequests1785218700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."delete_user_requests_status_enum" AS ENUM('PENDING', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(`
      CREATE TABLE "delete_user_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "reason" text NOT NULL,
        "businesses" jsonb NOT NULL DEFAULT '[]',
        "status" "public"."delete_user_requests_status_enum" NOT NULL DEFAULT 'PENDING',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_delete_user_requests" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_delete_user_requests_userId" ON "delete_user_requests" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_delete_user_requests_status" ON "delete_user_requests" ("status")`,
    );
    await queryRunner.query(`
      ALTER TABLE "delete_user_requests"
      ADD CONSTRAINT "FK_delete_user_requests_userId"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "delete_user_requests" DROP CONSTRAINT "FK_delete_user_requests_userId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_delete_user_requests_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_delete_user_requests_userId"`,
    );
    await queryRunner.query(`DROP TABLE "delete_user_requests"`);
    await queryRunner.query(
      `DROP TYPE "public"."delete_user_requests_status_enum"`,
    );
  }
}
