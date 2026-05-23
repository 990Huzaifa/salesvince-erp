import { Column, CreateDateColumn, DeleteDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Business } from "./business.entity";
import { Grn } from "./grn.entity";
import { PurchaseOrder } from "./purchase-order.entity";
import { Product, Uom } from "./product.entity";


@Entity('purchase-invoices')
export class PurchaseInvoice {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    businessId: string;

    @ManyToOne(() => Business, (business) => business.purchaseInvoices, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business: Business;

    @Column()
    grnId: string;

    @ManyToOne(() => Grn, (grn) => grn.purchaseInvoices, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'grnId' })
    grn: Grn;

    @Column()
    purchaseOrderId: string;

    @ManyToOne(() => PurchaseOrder, (purchaseOrder) => purchaseOrder.purchaseInvoices, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'purchaseOrderId' })
    purchaseOrder: PurchaseOrder;

    @Column()
    invoiceNumber: string;

    @Column()
    invoiceDate: Date;

    @Column({type: 'decimal', precision: 18, scale: 2})
    totalTaxAmount: number;

    @Column({type: 'decimal', precision: 18, scale: 2})
    totalDiscountAmount: number;

    @Column({type: 'decimal', precision: 18, scale: 2})
    totalAmount: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @DeleteDateColumn({ nullable: true })
    deletedAt: Date | null; 

    // relationships
    @OneToMany(() => PurchaseInvoiceItem, (item) => item.purchaseInvoice, { onDelete: 'CASCADE' })
    items: PurchaseInvoiceItem[];
}

@Entity('purchase-invoice-items')
export class PurchaseInvoiceItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    purchaseInvoiceId: string;

    @ManyToOne(() => PurchaseInvoice, (purchaseInvoice) => purchaseInvoice.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'purchaseInvoiceId' })
    purchaseInvoice: PurchaseInvoice;

    @Column()
    productId: string;

    @ManyToOne(() => Product, (product) => product.purchaseInvoiceItems, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column()
    uomId: string;

    @ManyToOne(() => Uom, (uom) => uom.purchaseInvoiceItems, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'uomId' })
    uom: Uom;

    @Column()
    quantity: number;   

    @Column({type: 'decimal', precision: 18, scale: 2})
    purchaseUnitPrice: number;

    @Column({type: 'decimal', precision: 18, scale: 2})
    discountPercentage: number;

    @Column({type: 'decimal', precision: 18, scale: 2})
    discountAmount: number;

    @Column({type: 'decimal', precision: 18, scale: 2})
    taxPercentage: number;

    @Column({type: 'decimal', precision: 18, scale: 2})
    taxAmount: number;

    @Column({type: 'decimal', precision: 18, scale: 2})
    totalAmount: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @DeleteDateColumn({ nullable: true })
    deletedAt: Date | null;
}