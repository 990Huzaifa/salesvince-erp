import { Business } from "./business.entity";
import { Column, CreateDateColumn, DeleteDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Warehouse } from "./warehouse.entity";
import { Party } from "./party.entity";
import { Product, ProductFlavour, Uom } from "./product.entity";
import { User } from "./user.entity";
import { PurchaseOrder } from "./purchase-order.entity";
import { PurchaseInvoice } from "./purchase-invoice.entity";

export enum GrnStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    REVERSED = 'REVERSED',
}

@Entity('goods_receive_notes')
export class Grn {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    purchaseOrderId: string;

    @ManyToOne(() => PurchaseOrder, (purchaseOrder) => purchaseOrder.grns, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'purchaseOrderId' })
    purchaseOrder: PurchaseOrder;

    @Column()
    businessId: string;

    @ManyToOne(() => Business, (business) => business.grns, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business: Business;

    @Column()
    warehouseId: string;

    @ManyToOne(() => Warehouse, (warehouse) => warehouse.grns, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'warehouseId' })
    warehouse: Warehouse;

    @Column()
    vendorId: string;

    @ManyToOne(() => Party, (party) => party.grns, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'vendorId' })
    vendor: Party;

    @Column({unique: true})
    grnNumber: string;

    @Column()
    grnDate: Date;

    @Column({nullable: true})
    notes: string;

    @Column({type: 'decimal', precision: 18, scale: 2})
    deliveryCost: number;

    @Column('uuid')
    createdBy: string;

    @ManyToOne(() => User, (user) => user.grns, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'createdBy' })
    createdByUser: User;

    @Column({type: 'decimal', precision: 18, scale: 2})
    totalTaxAmount: number;

    @Column({type: 'decimal', precision: 18, scale: 2})
    totalDiscountAmount: number;

    @Column({type: 'decimal', precision: 18, scale: 2})
    totalAmount: number;

    @Column()
    status: GrnStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @DeleteDateColumn({ nullable: true })
    deletedAt: Date | null;

    // relationships
    @OneToMany(() => GrnItem, (item) => item.grn, { onDelete: 'CASCADE' })
    items: GrnItem[];

    @OneToMany(() => PurchaseInvoice, (purchaseInvoice) => purchaseInvoice.grn, { onDelete: 'CASCADE' })
    purchaseInvoices: PurchaseInvoice[];
}

@Entity('grn_items')
export class GrnItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    grnId: string;
    
    @ManyToOne(() => Grn, (grn) => grn.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'grnId' })
    grn: Grn;

    @Column()
    productId: string;
    
    @ManyToOne(() => Product, (product) => product.grnItems, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column({nullable: true})
    productFlavourId: string;

    @ManyToOne(() => ProductFlavour, (productFlavour) => productFlavour.grnItems, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productFlavourId' })
    productFlavour: ProductFlavour;

    @Column()
    uomId: string;

    @ManyToOne(() => Uom, (uom) => uom.grnItems, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'uomId' })
    uom: Uom;

    @Column()
    orderedQuantity: number;

    @Column()
    receivedQuantity: number;

    @Column({type: 'decimal', precision: 18, scale: 2})
    purchaseUnitPrice: number;

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
}