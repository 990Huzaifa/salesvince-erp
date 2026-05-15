import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    OneToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';
@Entity('tenant_themes')
export class TenantTheme {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @OneToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tenant_id' })
    tenant: Tenant;

    @Column({ default: '#2563eb' })
    primaryColor: string;

    @Column({ default: '#f3f4f6' })
    secondaryColor: string;

    @Column({ default: '#f59e0b' })
    accentColor: string;

    @Column({ default: false })
    darkMode: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}