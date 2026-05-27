import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { SaleOrder, SaleOrderItem } from "./sale-order.entity";
import { Party} from "./party.entity";
import { Business } from "./business.entity";
import { Warehouse } from "./warehouse.entity";
import { Product, ProductFlavour, Uom } from "./product.entity";
import { SaleInvoice } from "./sale-invoice.entity";

export enum DeliveryNoteStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    REVERSED = 'REVERSED',
}

@Entity('delivery_notes')
export class DeliveryNote {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    businessId: string;

    @ManyToOne(() => Business, (business) => business.deliveryNotes, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business: Business;

    @Column()
    saleOrderId: string;

    @ManyToOne(() => SaleOrder, (saleOrder) => saleOrder.deliveryNotes, {onDelete: 'CASCADE' })
    @JoinColumn({ name: 'saleOrderId' })
    saleOrder: SaleOrder;

    @Column({ type: 'uuid'})
    warehouseId: string;

    @ManyToOne(() => Warehouse, (warehouse) => warehouse.deliveryNotes, {onDelete: 'CASCADE' })
    @JoinColumn({ name: 'warehouseId' })
    warehouse: Warehouse;

    @Column({ type: 'uuid'})
    customerId: string;

    @ManyToOne(() => Party, (party) => party.deliveryNotes, {onDelete: 'CASCADE' })
    @JoinColumn({ name: 'customerId' })
    customer: Party;

    @Column({unique: true})
    deliveryNoteNumber: string;

    @Column()
    deliveryNoteDate: Date;

    @Column({nullable: true})
    notes: string;

    @Column({type: 'decimal', precision: 18, scale: 2})
    deliveryCost: number;

    @Column({type: 'decimal', precision: 18, scale: 2})
    totalTaxAmount: number;

    @Column({type: 'decimal', precision: 18, scale: 2})
    totalDiscountAmount: number;

    @Column({type: 'decimal', precision: 18, scale: 2})
    totalAmount: number;

    @Column()
    status: DeliveryNoteStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => DeliveryNoteItem, (item) => item.deliveryNote, { onDelete: 'CASCADE' })
    items: DeliveryNoteItem[];

    @OneToMany(() => SaleInvoice, (saleInvoice) => saleInvoice.deliveryNote, { onDelete: 'CASCADE' })
    saleInvoices: SaleInvoice[];
}

@Entity('delivery-note-items')
export class DeliveryNoteItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    deliveryNoteId: string;

    @ManyToOne(() => DeliveryNote, (deliveryNote) => deliveryNote.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'deliveryNoteId' })
    deliveryNote: DeliveryNote;

    @Column()
    saleOrderItemId: string;

    @ManyToOne(() => SaleOrderItem, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'saleOrderItemId' })
    saleOrderItem: SaleOrderItem;

    @Column()
    productId: string;

    @ManyToOne(() => Product, (product) => product.deliveryNoteItems, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column({nullable: true})
    productFlavourId: string;

    @ManyToOne(() => ProductFlavour, (productFlavour) => productFlavour.deliveryNoteItems, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productFlavourId' })
    productFlavour: ProductFlavour;

    @Column()
    uomId: string;

    @ManyToOne(() => Uom, (uom) => uom.deliveryNoteItems, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'uomId' })
    uom: Uom;

    @Column()
    orderedQuantity: number;

    @Column()
    deliveredQuantity: number;

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
}       