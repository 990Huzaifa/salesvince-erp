import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    OneToOne,
    JoinColumn,
    CreateDateColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity({ name: 'tenant_db_configs' })
export class TenantDbConfig {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @OneToOne(() => Tenant, (tenant) => tenant.dbConfig, { onDelete: 'CASCADE' })
    @JoinColumn()
    tenant: Tenant;

    @Column()
    host: string;

    @Column()
    port: number;

    @Column()
    database: string;

    @Column()
    username: string;

    @Column()
    password: string;

    @CreateDateColumn()
    createdAt: Date;
}
