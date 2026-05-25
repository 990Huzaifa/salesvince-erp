import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { User } from "./user.entity";
import { Product, ProductFlavour, ProductPricing, Uom } from "./product.entity";
import { Business } from "./business.entity";
import { Party } from "./party.entity";
import { Warehouse } from "./warehouse.entity";


export enum OrderStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    CANCELLED = 'CANCELLED',
}

@Entity({ name: 'sale_orders' })
export class SaleOrder {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    businessId: string;

    @ManyToOne(() => Business, (business) => business.saleOrders, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business: Business;

    @Column({ type: 'uuid', nullable: true })
    warehouseId: string | null;

    @ManyToOne(() => Warehouse, { nullable: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'warehouseId' })
    warehouse: Warehouse | null;

    @Column({ type: 'uuid', nullable: true })
    customerId: string | null;

    @ManyToOne(() => Party, { nullable: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'customerId' })
    customer: Party | null;

    @Column({ unique: true })
    orderNumber: string;

    @Column({ type: 'enum', enum: OrderStatus })
    orderStatus: OrderStatus;

    @Column({ type: 'decimal', precision: 18, scale: 2})
    orderTotal: number;

    @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
    taxPercentage: number;

    @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
    taxAmount: number;

    @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
    discountPercentage: number;

    @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
    discountAmount: number;

    @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
    totalAmount: number;

    @Column({nullable: true})
    notes: string;
    
    @Column({ nullable: true, default: null })
    createdBy: string;

    @ManyToOne(() => User, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'createdBy' })
    createdByUser: User | null;   

    @Column()
    orderDate: Date;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => SaleOrderItem, (item) => item.saleOrder)
    items: SaleOrderItem[];
}

@Entity({ name: 'sale_order_items' })
export class SaleOrderItem {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    saleOrderId: string;

    @ManyToOne(() => SaleOrder, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'saleOrderId' })
    saleOrder: SaleOrder;

    @Column()
    productId: string;

    @ManyToOne(() => Product, (product) => product.saleOrderItems, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column({nullable: true})
    productFlavourId: string;

    @ManyToOne(() => ProductFlavour, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'productFlavourId' })
    productFlavour: ProductFlavour;

    @Column()
    uomId: string;

    @ManyToOne(() => Uom, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'uomId' })
    uom: Uom;

    @Column({type: 'decimal', precision: 18, scale: 2})
    purchaseUnitPrice: number;

    @Column({type: 'decimal', precision: 18, scale: 2})
    saleMarginAmount: number;

    @Column({type: 'decimal', precision: 18, scale: 2})
    saleMarginPercentage: number;

    @Column()
    quantity: number;

    @Column({type: 'decimal', precision: 18, scale: 2, default: 0})
    discountPercentage: number;

    @Column({type: 'decimal', precision: 18, scale: 2, default: 0})
    discountAmount: number;

    @Column({type: 'decimal', precision: 18, scale: 2, default: 0})
    totalAmount: number;    

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}