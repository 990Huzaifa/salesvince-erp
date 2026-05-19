import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { User } from "./user.entity";
import { Product, ProductFlavour, ProductPricing } from "./product.entity";


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

    @Column({ type: 'enum', enum: OrderStatus })
    orderStatus: OrderStatus;

    @Column()
    orderTotal: number;

    @Column({ default: 0 })
    taxPercentage: number;

    @Column({ default: 0 })
    taxAmount: number;

    @Column({ default: 0 })
    discountPercentage: number;

    @Column({ default: 0 })
    discountAmount: number;

    @Column({ default: 0 })
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

    @ManyToOne(() => Product, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column({nullable: true})
    productFlavourId: string;

    @ManyToOne(() => ProductFlavour, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'productFlavourId' })
    productFlavour: ProductFlavour;

    @Column()
    productPricingId: string;

    @ManyToOne(() => ProductPricing, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productPricingId' })
    productPricing: ProductPricing;

    @Column()
    quantity: number;

    @Column({default: 0})
    discountPercentage: number;

    @Column({default: 0})
    discountAmount: number;

    @Column({default: 0})
    totalAmount: number;    

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}