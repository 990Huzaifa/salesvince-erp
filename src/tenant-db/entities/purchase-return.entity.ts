import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { PurchaseInvoice } from "./purchase-invoice.entity";
import { Product, ProductFlavour, Uom } from "./product.entity";
import { Business } from "./business.entity";

export enum PurchaseReturnStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',

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

    @Column()
    purchaseInvoiceId: string;

    @ManyToOne(() => PurchaseInvoice, (purchaseInvoice) => purchaseInvoice.purchaseReturns)
    purchaseInvoice: PurchaseInvoice;

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

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}   