import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Tenant } from "./tenant.entity";
import { Plan } from "./plan.entity";
import { Addon } from "./addon.entity";

export enum Status {
    ACTIVE = 'ACTIVE',
    PAST_DUE = 'PAST_DUE',
    SUSPENDED = 'SUSPENDED',
    EXPIRED = 'EXPIRED',
}

export enum BillingModel {
    SELF_SERVE = 'SELF_SERVE',
    SALES_DRIVEN = 'SALES_DRIVEN',
}

export enum PaymentMode {
    ONLINE = 'ONLINE',
    OFFLINE = 'OFFLINE',
}

export enum CollectionType {
    AUTO = 'AUTO',
    MANUAL = 'MANUAL',
}

@Entity({ name: 'subscriptions' })
export class Subscription {

    @PrimaryGeneratedColumn()
    id: number;

    @OneToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tenant_id' })
    tenant: Tenant;

    @ManyToOne(() => Plan, { onDelete: 'CASCADE' })
    plan: Plan;

    @OneToMany(() => SubscriptionAddon, (subscriptionAddon) => subscriptionAddon.subscription)
    subscriptionAddons: SubscriptionAddon[];

    @Column({ type: 'enum', enum: BillingModel })
    billingModel: BillingModel;

    @Column({ type: 'enum', enum: PaymentMode })
    paymentMode: PaymentMode;

    @Column({ type: 'enum', enum: CollectionType })
    collectionType: CollectionType;

    @Column({ type: 'enum', enum: Status })
    status: Status;

    @Column()
    expiresAt: Date;

    @Column({ nullable: true })
    cancelledAt: Date;

    @CreateDateColumn()
    createdAt?: Date;

    @UpdateDateColumn()
    updatedAt?: Date;
}


@Entity({ name: 'subscription_addons' })
export class SubscriptionAddon {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Subscription, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'subscription_id' })
    subscription: Subscription;

    @ManyToOne(() => Addon, { onDelete: 'CASCADE'})
    @JoinColumn({ name: 'addon_id' })
    addon: Addon;

    @Column()
    quantity: number;

    @CreateDateColumn()
    createdAt?: Date;

    @UpdateDateColumn()
    updatedAt?: Date;

    
}