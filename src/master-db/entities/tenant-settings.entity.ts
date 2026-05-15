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

export enum BaseUom {
    PCS = 'PCS',
    LTR = 'LTR',
    KGS = 'KGS',
}

export enum BaseLocale {
    EN = 'en',
    AR = 'ar',
}

export enum Currency {
    USD = 'USD',
    SAR = 'SAR',
    KWD = 'KWD',
    AED = 'AED',
    PKR = 'PKR',
}

@Entity({ name: 'tenant_settings' })
export class TenantSettings {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @OneToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tenant_id' })
    tenant: Tenant;

    @Column({ default: 'UTC' })
    timezone: string;

    @Column({ type: 'enum', enum: Currency, default: Currency.USD })
    currency: Currency;

    @Column({ type: 'enum', enum: BaseUom, default: BaseUom.PCS })
    baseUom: BaseUom;

    @Column({ type: 'enum', enum: BaseLocale, default: BaseLocale.EN })
    baseLocale: BaseLocale;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
