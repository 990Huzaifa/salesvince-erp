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

export enum GeoScopeType {
    GLOBAL = 'GLOBAL',
    COUNTRY = 'COUNTRY',
    STATE = 'STATE',
}

@Entity({ name: 'tenant_geo_policies' })
export class TenantGeoPolicy {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    /**
     * One-to-one link with Tenant
     * Auto delete policy if tenant deleted
     */
    @OneToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn()
    tenant: Tenant;

    /**
     * GLOBAL | COUNTRY | STATE
     */
    @Column({
        type: 'enum',
        enum: GeoScopeType,
        default: GeoScopeType.GLOBAL,
    })
    scope_type: GeoScopeType;

    /**
     * Logical reference to countries.id (Master DB)
     */
    @Column({ nullable: true })
    country_id: string | null;

    /**
     * Logical reference to states.id (Master DB)
     */
    @Column({ nullable: true })
    state_id: string | null;

    @Column({ default: true })
    is_active: boolean;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
