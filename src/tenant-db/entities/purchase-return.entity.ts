import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { PurchaseInvoice } from "./purchase-invoice.entity";
import { Product, ProductFlavour, Uom } from "./product.entity";
import { Business } from "./business.entity";
import { Party } from "./party.entity";
import { Warehouse } from "./warehouse.entity";

export enum PurchaseReturnStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',

}

export enum PurchaseReturnMode {
    INVOICE = 'INVOICE',
    SUPPLIER = 'SUPPLIER',
}

@Entity('purchase_returns')
export class PurchaseReturn {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    businessId: string;

    @ManyToOne(() => Business, (business) => business.purchaseReturns, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business: Business;

    @Column({
        type: 'enum',
        enum: PurchaseReturnMode,
        default: PurchaseReturnMode.INVOICE,
    })
    returnMode: PurchaseReturnMode;

    @Column({ nullable: true })
    purchaseInvoiceId: string | null;

    @ManyToOne(() => PurchaseInvoice, (purchaseInvoice) => purchaseInvoice.purchaseReturns, {
        nullable: true,
    })
    @JoinColumn({ name: 'purchaseInvoiceId' })
    purchaseInvoice: PurchaseInvoice | null;

    @Column()
    vendorId: string;

    @ManyToOne(() => Party, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'vendorId' })
    vendor: Party;

    @Column({ nullable: true })
    warehouseId: string | null;

    @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT', nullable: true })
    @JoinColumn({ name: 'warehouseId' })
    warehouse: Warehouse | null;

    @Column({ unique: true })
    returnNumber: string;

    @Column()
    returnDate: Date;

    @Column()
    returnReason: string;

    @Column(
        {
            type: 'enum',
            enum: PurchaseReturnStatus,
            default: PurchaseReturnStatus.PENDING,
        }
    )
    status: PurchaseReturnStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => PurchaseReturnItem, (item) => item.purchaseReturn)
    purchaseReturnItems: PurchaseReturnItem[];
}

@Entity('purchase_return_items')
export class PurchaseReturnItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    purchaseReturnId: string;

    @ManyToOne(() => PurchaseReturn, (purchaseReturn) => purchaseReturn.purchaseReturnItems)
    purchaseReturn: PurchaseReturn;

    @Column()
    productId: string;

    @ManyToOne(() => Product, (product) => product.purchaseReturnItems)
    product: Product;

    @Column({nullable: true})
    productFlavourId: string;

    @ManyToOne(() => ProductFlavour, (productFlavour) => productFlavour.purchaseReturnItems)
    productFlavour: ProductFlavour;

    @Column()
    uomId: string;

    @ManyToOne(() => Uom, (uom) => uom.purchaseReturnItems)
    uom: Uom;

    @Column()
    quantity: number;

    @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
    purchaseUnitPrice: number;

    @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
    saleUnitPrice: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
