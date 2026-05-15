import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Tenant } from "./tenant.entity";

@Entity({ name: 'tenant_provisioning_jobs' })
export class TenantProvisioningJob {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tenant_id' })
    tenant: Tenant;

    @Column()
    status: 'RUNNING' | 'SUCCESS' | 'FAILED';

    @CreateDateColumn()
    startedAt: Date;

    @Column({ nullable: true })
    finishedAt?: Date;

    @Column({ type: 'text', nullable: true })
    errorMessage?: string;
}
