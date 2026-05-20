import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { User } from "./user.entity";
import { Product, ProductFlavour, Uom } from "./product.entity";
import { Party } from "./party.entity";
import { Warehouse } from "./warehouse.entity";


export enum OrderStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    CANCELLED = 'CANCELLED',
}

@Entity({ name: 'purchase_orders' })
export class PurchaseOrder {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    orderNumber: string;

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


    @Column({ type: 'enum', enum: OrderStatus })
    orderStatus: OrderStatus;

    @Column({type: 'decimal', precision: 18, scale: 2})
    orderTotal: number;

    @Column({type: 'decimal', precision: 18, scale: 2, default: 0})
    deliveryCost: number;

    @Column({type: 'decimal', precision: 18, scale: 2})
    taxPercentage: number;

    @Column({type: 'decimal', precision: 18, scale: 2})
    taxAmount: number;

    @Column({type: 'decimal', precision: 18, scale: 2})
    discountPercentage: number;

    @Column({type: 'decimal', precision: 18, scale: 2})
    discountAmount: number;

    @Column({type: 'decimal', precision: 18, scale: 2})
    totalAmount: number;

    @Column({nullable: true})
    notes: string;
    
    @Column('uuid')
    createdBy: string;

    @ManyToOne(() => User, (user) => user.purchaseOrders, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'createdBy' })
    createdByUser: User;

    @Column()
    orderDate: Date;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => PurchaseOrderItem, (item) => item.PurchaseOrder)
    items: PurchaseOrderItem[];
}

@Entity({ name: 'purchase_order_items' })
export class PurchaseOrderItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    purchaseOrderId: string;

    @ManyToOne(() => PurchaseOrder, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'purchaseOrderId' })
    PurchaseOrder: PurchaseOrder;

    @Column()
    productId: string;

    @ManyToOne(() => Product, (product) => product.purchaseOrderItems, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column({nullable: true})
    productFlavourId: string;

    @ManyToOne(() => ProductFlavour, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'productFlavourId' })
    productFlavour: ProductFlavour;

    @Column()
    uomId: string;

    @ManyToOne(() => Uom, (uom) => uom.purchaseOrderItems, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'uomId' })
    uom: Uom;

    @Column({type: 'decimal', precision: 18, scale: 2})
    purchaseUnitPrice: number;

    @Column({type: 'decimal', precision: 18, scale: 2})
    saleUnitMarginAmount: number;

    @Column({ type: 'decimal', precision: 18, scale: 2})
    saleUnitMarginPercentage: number;

    @Column()
    quantity: number;

    @Column({ type: 'decimal', precision: 18, scale: 2, default: 0})
    discountPercentage: number;

    @Column({ type: 'decimal', precision: 18, scale: 2, default: 0})
    discountAmount: number;

    @Column({ type: 'decimal', precision: 18, scale: 2, default: 0})
    totalAmount: number;    

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}