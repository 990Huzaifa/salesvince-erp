import { MigrationInterface, QueryRunner } from 'typeorm';

export class SqlAgentChat1780405000000 implements MigrationInterface {
  name = 'SqlAgentChat1780405000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "sql_agent_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "businessId" uuid NOT NULL, "title" character varying(255), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_sql_agent_sessions" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_sql_agent_sessions_user_business" ON "sql_agent_sessions" ("userId", "businessId")`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."sql_agent_messages_role_enum" AS ENUM('USER', 'ASSISTANT')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."sql_agent_messages_status_enum" AS ENUM('SUCCESS', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "sql_agent_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sessionId" uuid NOT NULL, "role" "public"."sql_agent_messages_role_enum" NOT NULL, "content" text NOT NULL, "sql" text, "status" "public"."sql_agent_messages_status_enum", "metadata" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_sql_agent_messages" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_sql_agent_messages_session" ON "sql_agent_messages" ("sessionId", "createdAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "sql_agent_messages" ADD CONSTRAINT "FK_sql_agent_messages_session" FOREIGN KEY ("sessionId") REFERENCES "sql_agent_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sql_agent_messages" DROP CONSTRAINT "FK_sql_agent_messages_session"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_sql_agent_messages_session"`);
    await queryRunner.query(`DROP TABLE "sql_agent_messages"`);
    await queryRunner.query(`DROP TYPE "public"."sql_agent_messages_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."sql_agent_messages_role_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_sql_agent_sessions_user_business"`,
    );
    await queryRunner.query(`DROP TABLE "sql_agent_sessions"`);
  }
}
