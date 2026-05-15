import { MigrationInterface, QueryRunner } from "typeorm";

export class TenantDb1778846184580 implements MigrationInterface {
    name = 'TenantDb1778846184580'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."chart_of_accounts_accountkind_enum" AS ENUM('SYSTEM', 'PARTY_RECEIVABLE', 'PARTY_PAYABLE')`);
        await queryRunner.query(`CREATE TABLE "chart_of_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "businessId" uuid NOT NULL, "partyId" uuid, "accountKind" "public"."chart_of_accounts_accountkind_enum" NOT NULL DEFAULT 'SYSTEM', "name" character varying NOT NULL, "code" character varying NOT NULL, "parentCode" character varying, "isPostable" boolean NOT NULL DEFAULT true, "level1" integer NOT NULL DEFAULT '0', "level2" integer NOT NULL DEFAULT '0', "level3" integer NOT NULL DEFAULT '0', "level4" integer NOT NULL DEFAULT '0', "level5" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "PK_467c08a2efc78393c647da32bac" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_1df35b3ae00677b6d3b960868e" ON "chart_of_accounts" ("businessId", "accountKind") `);
        await queryRunner.query(`CREATE INDEX "IDX_8b7eaea2fa2f3bcc84ad9aaf92" ON "chart_of_accounts" ("businessId", "partyId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_a258809c85f6e8949b3920bf09" ON "chart_of_accounts" ("businessId", "code") `);
        await queryRunner.query(`CREATE TYPE "public"."parties_type_enum" AS ENUM('CUSTOMER', 'VENDOR', 'BOTH')`);
        await queryRunner.query(`CREATE TABLE "parties" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "businessId" uuid NOT NULL, "code" character varying(50) NOT NULL, "receivableAccountId" uuid, "payableAccountId" uuid, "name" character varying(200) NOT NULL, "type" "public"."parties_type_enum" NOT NULL, "email" character varying(150), "phone" character varying(50), "whatsAppNumber" character varying(50), "alternatePhone" character varying(50), "ntnNumber" character varying(50), "strnNumber" character varying(50), "cnic" character varying(20), "taxNumber" character varying(50), "address" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "PK_da698299dca60d55f0050dde935" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_18bcff4d4f291cadef07331a46" ON "parties" ("businessId", "code") `);
        await queryRunner.query(`CREATE TYPE "public"."businesses_status_enum" AS ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED')`);
        await queryRunner.query(`CREATE TABLE "businesses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(150) NOT NULL, "legalName" character varying(180), "currency" character varying(10) NOT NULL DEFAULT 'PKR', "financialYearStart" date, "financialYearEnd" date, "status" "public"."businesses_status_enum" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "PK_bc1bf63498dd2368ce3dc8686e8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_31e657169754a8feaa08c17bc2" ON "businesses" ("name") `);
        await queryRunner.query(`CREATE TABLE "permissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "key" character varying(150) NOT NULL, "name" character varying(150) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_920331560282b8bd21bb02290df" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_017943867ed5ceef9c03edd974" ON "permissions" ("key") `);
        await queryRunner.query(`CREATE TABLE "role_permissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "roleId" uuid NOT NULL, "permissionId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_84059017c90bfcb701b8fa42297" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_d430a02aad006d8a70f3acd7d0" ON "role_permissions" ("roleId", "permissionId") `);
        await queryRunner.query(`CREATE TYPE "public"."roles_status_enum" AS ENUM('ACTIVE', 'INACTIVE')`);
        await queryRunner.query(`CREATE TABLE "roles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(100) NOT NULL, "description" character varying(255), "isSystemRole" boolean NOT NULL DEFAULT false, "status" "public"."roles_status_enum" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_648e3f5447f725579d7d4ffdfb" ON "roles" ("name") `);
        await queryRunner.query(`CREATE TYPE "public"."user_businesses_status_enum" AS ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED')`);
        await queryRunner.query(`CREATE TABLE "user_businesses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "businessId" uuid NOT NULL, "roleId" uuid NOT NULL, "status" "public"."user_businesses_status_enum" NOT NULL DEFAULT 'ACTIVE', "permissionVersion" integer NOT NULL DEFAULT '1', "lastSelectedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "PK_a79c8d582e8d7582e92dac57beb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_618d4e9c71657ed503e27eee42" ON "user_businesses" ("userId", "businessId") `);
        await queryRunner.query(`CREATE TYPE "public"."users_status_enum" AS ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying NOT NULL, "name" character varying(150) NOT NULL, "email" character varying(150) NOT NULL, "password" character varying(255), "status" "public"."users_status_enum" NOT NULL DEFAULT 'ACTIVE', "phone" character varying, "avatar" character varying, "cnic" character varying, "address" character varying, "fcmToken" character varying, "deviceId" character varying, "appVersion" character varying, "isSuperAdmin" boolean NOT NULL DEFAULT false, "lastLoginAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, CONSTRAINT "UQ_1f7a2b11e29b1422a2622beab36" UNIQUE ("code"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `);
        await queryRunner.query(`CREATE TABLE "activity_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actorId" uuid, "action" character varying(120) NOT NULL, "description" text, "metadata" jsonb, "jobId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_f25287b6140c5ba18d38776a796" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "FK_aef65ea45fb800ed224b252184a" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "FK_85c4d3a6b8e85970fa4965f2e44" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "parties" ADD CONSTRAINT "FK_e84e33a64bed346ea260371fdcd" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "parties" ADD CONSTRAINT "FK_24b15ab9bfb00d8f0a407110a4b" FOREIGN KEY ("receivableAccountId") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "parties" ADD CONSTRAINT "FK_5d580c86dc1fbcbf226b32d1f7d" FOREIGN KEY ("payableAccountId") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_b4599f8b8f548d35850afa2d12c" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_06792d0c62ce6b0203c03643cdd" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_businesses" ADD CONSTRAINT "FK_1a2fd3e163cd1d20912b87bc35c" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_businesses" ADD CONSTRAINT "FK_b09272549f21e881f0d6faa0012" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_businesses" ADD CONSTRAINT "FK_b8e35890a97d885996f2adef834" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "activity_logs" ADD CONSTRAINT "FK_110bb0d32b7f65be46be37e2577" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "activity_logs" DROP CONSTRAINT "FK_110bb0d32b7f65be46be37e2577"`);
        await queryRunner.query(`ALTER TABLE "user_businesses" DROP CONSTRAINT "FK_b8e35890a97d885996f2adef834"`);
        await queryRunner.query(`ALTER TABLE "user_businesses" DROP CONSTRAINT "FK_b09272549f21e881f0d6faa0012"`);
        await queryRunner.query(`ALTER TABLE "user_businesses" DROP CONSTRAINT "FK_1a2fd3e163cd1d20912b87bc35c"`);
        await queryRunner.query(`ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_06792d0c62ce6b0203c03643cdd"`);
        await queryRunner.query(`ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_b4599f8b8f548d35850afa2d12c"`);
        await queryRunner.query(`ALTER TABLE "parties" DROP CONSTRAINT "FK_5d580c86dc1fbcbf226b32d1f7d"`);
        await queryRunner.query(`ALTER TABLE "parties" DROP CONSTRAINT "FK_24b15ab9bfb00d8f0a407110a4b"`);
        await queryRunner.query(`ALTER TABLE "parties" DROP CONSTRAINT "FK_e84e33a64bed346ea260371fdcd"`);
        await queryRunner.query(`ALTER TABLE "chart_of_accounts" DROP CONSTRAINT "FK_85c4d3a6b8e85970fa4965f2e44"`);
        await queryRunner.query(`ALTER TABLE "chart_of_accounts" DROP CONSTRAINT "FK_aef65ea45fb800ed224b252184a"`);
        await queryRunner.query(`DROP TABLE "activity_logs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_618d4e9c71657ed503e27eee42"`);
        await queryRunner.query(`DROP TABLE "user_businesses"`);
        await queryRunner.query(`DROP TYPE "public"."user_businesses_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_648e3f5447f725579d7d4ffdfb"`);
        await queryRunner.query(`DROP TABLE "roles"`);
        await queryRunner.query(`DROP TYPE "public"."roles_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d430a02aad006d8a70f3acd7d0"`);
        await queryRunner.query(`DROP TABLE "role_permissions"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_017943867ed5ceef9c03edd974"`);
        await queryRunner.query(`DROP TABLE "permissions"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_31e657169754a8feaa08c17bc2"`);
        await queryRunner.query(`DROP TABLE "businesses"`);
        await queryRunner.query(`DROP TYPE "public"."businesses_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_18bcff4d4f291cadef07331a46"`);
        await queryRunner.query(`DROP TABLE "parties"`);
        await queryRunner.query(`DROP TYPE "public"."parties_type_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a258809c85f6e8949b3920bf09"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8b7eaea2fa2f3bcc84ad9aaf92"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1df35b3ae00677b6d3b960868e"`);
        await queryRunner.query(`DROP TABLE "chart_of_accounts"`);
        await queryRunner.query(`DROP TYPE "public"."chart_of_accounts_accountkind_enum"`);
    }

}
