import { Column, CreateDateColumn, DeleteDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Business } from "./business.entity";
import { SaleOrder } from "./sale-order.entity";
import { Product, ProductFlavour, Uom } from "./product.entity";
import { DeliveryNote } from "./delivery-note.entity";
import { SaleReturn } from "./sale-return.entity";
import { Party } from "./party.entity";


@Entity('sale-invoices')
export class SaleInvoice {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    businessId: string;

    @ManyToOne(() => Business, (business) => business.saleInvoices, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business: Business;

    @Column()
    deliveryNoteId: string;

    @ManyToOne(() => DeliveryNote, (deliveryNote) => deliveryNote.saleInvoices, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'deliveryNoteId' })
    deliveryNote: DeliveryNote;

    @Column()
    customerId: string;

    @ManyToOne(() => Party, (party) => party.saleInvoices, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'customerId' })
    customer: Party;

    @Column()
    saleOrderId: string;

    @ManyToOne(() => SaleOrder, (saleOrder) => saleOrder.saleInvoices, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'saleOrderId' })
    saleOrder: SaleOrder;

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

    @OneToMany(() => SaleReturn, (saleReturn) => saleReturn.saleInvoice, { onDelete: 'CASCADE' })
    saleReturns: SaleReturn[];

    @OneToMany(() => SaleInvoiceItem, (item) => item.saleInvoice, { onDelete: 'CASCADE' })
    items: SaleInvoiceItem[];
}

@Entity('sale-invoice-items')
export class SaleInvoiceItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    saleInvoiceId: string;

    @ManyToOne(() => SaleInvoice, (saleInvoice) => saleInvoice.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'saleInvoiceId' })
    saleInvoice: SaleInvoice;

    @Column()
    productId: string;

    @ManyToOne(() => Product, (product) => product.saleInvoiceItems, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column()
    uomId: string;

    @ManyToOne(() => Uom, (uom) => uom.saleInvoiceItems, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'uomId' })
    uom: Uom;

    @Column({nullable: true})
    productFlavourId: string;

    @ManyToOne(() => ProductFlavour, (productFlavour) => productFlavour.saleInvoiceItems, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productFlavourId' })
    productFlavour: ProductFlavour;

    @Column()
    quantity: number;   

    @Column({type: 'decimal', precision: 18, scale: 2})
    saleUnitPrice: number;

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