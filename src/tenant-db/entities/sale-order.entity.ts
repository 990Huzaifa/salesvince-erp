import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { User } from "./user.entity";
import { Product, ProductFlavour, ProductPricing } from "./product.entity";


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