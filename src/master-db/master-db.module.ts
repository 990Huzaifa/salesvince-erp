import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Tenant } from './entities/tenant.entity';
import { TenantDbConfig } from './entities/tenant-db-config.entity';
import { PlatformRole } from './entities/platform-role.entity';
import { PlatformPermission } from './entities/platform-premission.entity';
import { PlatformUser } from './entities/platform-user.entity';

@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                type: 'postgres',
                host: process.env.MASTER_DB_HOST,
                port: Number(process.env.MASTER_DB_PORT),
                username: process.env.MASTER_DB_USER,
                password: process.env.MASTER_DB_PASS,
                database: process.env.MASTER_DB_NAME,
                autoLoadEntities: true,
                synchronize: false,
            }),
        }),

        // 🔥 THIS LINE IS THE REAL FIX
        TypeOrmModule.forFeature([Tenant, TenantDbConfig,PlatformRole,PlatformPermission,PlatformUser]),
    ],
})
export class MasterDbModule { }
