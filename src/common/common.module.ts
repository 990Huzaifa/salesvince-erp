import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../master-db/entities/tenant.entity';
import { TenantResolverMiddleware } from './middleware/tenant-resolver.middleware';
import { PusherService } from './pusher/pusher.service';
import { S3Service } from './s3/s3.service';

@Module({
    imports: [TypeOrmModule.forFeature([Tenant])],
    providers: [TenantResolverMiddleware, PusherService, S3Service],
    exports: [TenantResolverMiddleware, PusherService, S3Service],
})
export class CommonModule { }
