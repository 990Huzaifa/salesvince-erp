import { Column, CreateDateColumn, DeleteDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Business } from "./business.entity";
import { PurchaseOrder } from "./purchase-order.entity";
import { Grn } from "./grn.entity";
import { StockBalance, Batch, StockMovement } from "./stock.entity";

@Entity('warehouses')
export class Warehouse {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column()
    businessId: string;

    @ManyToOne(() => Business, (business) => business.warehouses, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business: Business;

    @Column()
    code: string;

    @Column()
    address: string;

    @Column()
    cityId: string;
    
    @Column()
    stateId: string;

    @Column()
    countryId: string;

    @Column({nullable: true})
    zipCode: string;
    
    @Column({nullable: true})
    phone: string;

    @Column({nullable: true})
    email: string;

    @Column({nullable: true})
    website: string;
    
    @Column({nullable: true})
    contactPersonName: string;

    @Column({nullable: true})
    contactPersonPhone: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @DeleteDateColumn({ nullable: true })
    deletedAt: Date | null;


    // relationships
    @OneToMany(() => Grn, (grn) => grn.warehouse, { onDelete: 'CASCADE' })
    grns: Grn[];
    @OneToMany(() => PurchaseOrder, (purchaseOrder) => purchaseOrder.warehouse, { onDelete: 'CASCADE' })
    purchaseOrders: PurchaseOrder[];

    @OneToMany(() => Batch, (batch) => batch.warehouse, { onDelete: 'CASCADE' })
    batches: Batch[];

    @OneToMany(() => StockBalance, (stockBalance) => stockBalance.warehouse, { onDelete: 'CASCADE' })
    stockBalances: StockBalance[];  

    @OneToMany(() => StockMovement, (stockMovement) => stockMovement.warehouse, { onDelete: 'CASCADE' })
    stockMovements: StockMovement[];
}    