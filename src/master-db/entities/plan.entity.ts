import { Column, CreateDateColumn, PrimaryGeneratedColumn, Entity, UpdateDateColumn, JoinColumn, OneToMany, ManyToOne } from "typeorm";

export enum LIMIT_KEY {
    USER = 'USER',
    STORAGE = 'STORAGE',
    BUSINESS = 'BUSINESS',
    EMPLOYEES = 'EMPLOYEES',
}

export enum BillingCycle {
    MONTHLY = 'MONTHLY',
    YEARLY = 'YEARLY',
}

@Entity({ name: 'plans' })
export class Plan {

    @PrimaryGeneratedColumn()
    id: string;

    @Column()
    title: string;

    @Column({ nullable: true })
    stripe_price_id: string;

    @Column({ nullable: true })
    payfast_price_id: string;

    @OneToMany(() => PlanLimit, (plan_limits) => plan_limits.plan) // Assuming it's a OneToMany relation
    plan_limits: PlanLimit[];

    @Column()
    slug: string;

    @Column()
    description: string;

    @Column()
    currency: string;

    @Column()
    price: string;

    @Column()
    billing_cycle: BillingCycle;

    @Column()
    is_active: boolean;

    @Column()
    is_display: boolean;

    @CreateDateColumn()
    createdAt: Date;
    
    @UpdateDateColumn()
    updatedAt: Date;
}


@Entity({ name: 'plan_limits' })
export class PlanLimit {

    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Plan, (plan) => plan.plan_limits , { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'plan_id' })
    plan: Plan;

    @Column({ type: 'enum', enum: LIMIT_KEY })
    limitKey: LIMIT_KEY;

    @Column()
    limitValue: number;
}