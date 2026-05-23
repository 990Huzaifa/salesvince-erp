import {
    Column,
    CreateDateColumn,
    DeleteDateColumn,
    Entity,
    Index,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { UserBusiness } from './user-business.entity';
import { Grn } from './grn.entity';
import { PurchaseOrder } from './purchase-order.entity';
import { PurchaseQuotation } from './purchase-quotation.entity';
import { SaleQuotation } from './sale-quotation.entity';
export enum UserStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
    SUSPENDED = 'SUSPENDED',
}

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    code: string;

    @Column({ type: 'varchar', length: 150 })
    name: string;

    @Index({ unique: true })
    @Column({ type: 'varchar', length: 150 })
    email: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    password: string | null;

    @Column({
        type: 'enum',
        enum: UserStatus,
        default: UserStatus.ACTIVE,
    })
    status: UserStatus;


    @Column({ nullable: true })
    phone: string;

    @Column({ nullable: true })
    avatar: string;

    @Column({ nullable: true })
    cnic: string;

    @Column({ nullable: true })
    address: string;

    @Column({ nullable: true })
    fcmToken: string;

    @Column({ nullable: true })
    deviceId: string;

    @Column({ nullable: true })
    appVersion: string;

    @Column({ type: 'boolean', default: false })
    isSuperAdmin: boolean;

    @Column({ type: 'timestamp', nullable: true })
    lastLoginAt: Date | null;

    @OneToMany(() => UserBusiness, (userBusiness) => userBusiness.user)
    userBusinesses: UserBusiness[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @DeleteDateColumn({ nullable: true })
    deletedAt: Date | null;

    // relationships
    @OneToMany(() => PurchaseQuotation, (purchaseQuotation) => purchaseQuotation.createdByUser, { onDelete: 'CASCADE' })
    purchaseQuotations: PurchaseQuotation[];
    
    @OneToMany(() => Grn, (grn) => grn.createdByUser, { onDelete: 'CASCADE' })
    grns: Grn[];

    @OneToMany(() => PurchaseOrder, (purchaseOrder) => purchaseOrder.createdByUser, { onDelete: 'CASCADE' })
    purchaseOrders: PurchaseOrder[];

    @OneToMany(() => SaleQuotation, (saleQuotation) => saleQuotation.createdByUser, { onDelete: 'CASCADE' })
    saleQuotations: SaleQuotation[];
}