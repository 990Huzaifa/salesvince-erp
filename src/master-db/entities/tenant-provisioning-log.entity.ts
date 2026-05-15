import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { TenantProvisioningJob } from "./tenant-provisioning-job.entity";
@Entity({ name: 'tenant_provisioning_logs' })
export class TenantProvisioningLog {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => TenantProvisioningJob, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'job_id' })
    job: TenantProvisioningJob;

    @Column()
    level: 'INFO' | 'ERROR';

    @Column('text')
    message: string;

    @CreateDateColumn()
    createdAt: Date;
}
