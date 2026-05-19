import { Column, CreateDateColumn, DeleteDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Business } from "./business.entity";
import { Warehouse } from "./warehouse.entity";
import { Product } from "./product.entity";

export enum StockMovementType {
    IN = 'IN',
    OUT = 'OUT',
}

export enum ReferenceType {
    PURCHAS = 'PURCHASE',
    SALE = 'SALE',
    PURCHASE_RETURN = 'PURCHASE_RETURN',
    SALE_RETURN = 'SALE_RETURN',
    TRANSFER = 'TRANSFER',
    ADJUSTMENT = 'ADJUSTMENT'
}


@Entity({ name: 'batchs' })
export class Batch {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({type: 'uuid'})
    businessId: string;

    @ManyToOne(() => Business, (business) => business.batches, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business: Business;

    @Column({type: 'uuid'})
    warehouseId: string;

    @ManyToOne(() => Warehouse, (warehouse) => warehouse.batches, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'warehouseId' })
    warehouse: Warehouse;

    @Column()
    batchNumber: string;
    
    @Column()
    productId: string;

    @ManyToOne(() => Product, (product) => product.batches, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column()
    quantity: number;

    @Column()
    purchaseUnitPrice: number;

    @Column()
    saleUnitMarginAmount: number;

    @Column()
    saleUnitMarginPercentage: number;

    @Column()
    batchDate: Date;

    @Column({nullable: true})
    expiryDate: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @DeleteDateColumn({ nullable: true })
    deletedAt: Date | null; 


    // relationships
    @OneToMany(() => StockBalance, (stockBalance) => stockBalance.batch, { onDelete: 'CASCADE' })
    stockBalances: StockBalance[];
}   

@Entity({ name: 'stock_balances' })
export class StockBalance {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    businessId: string;

    @ManyToOne(() => Business, (business) => business.stockBalances, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business: Business;

    @Column()
    warehouseId: string;

    @ManyToOne(() => Warehouse, (warehouse) => warehouse.stockBalances, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'warehouseId' })
    warehouse: Warehouse;

    @Column()
    productId: string;

    @ManyToOne(() => Product, (product) => product.stockBalances, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column()
    quantityAvailable: number;

    @Column()
    quantityOnHand: number;
    
    @Column()
    quantityReserved: number;

    @Column()
    quantityDamaged: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @DeleteDateColumn({ nullable: true })
    deletedAt: Date | null;

    // relationships
    @ManyToOne(() => Batch, (batch) => batch.stockBalances, { onDelete: 'CASCADE' })
    batch: Batch;
}

@Entity({ name: 'stock_movements' })
export class StockMovement {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    businessId: string;

    @ManyToOne(() => Business, (business) => business.stockMovements, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'businessId' })
    business: Business;

    @Column()
    warehouseId: string;

    @ManyToOne(() => Warehouse, (warehouse) => warehouse.stockMovements, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'warehouseId' })
    warehouse: Warehouse;
    
    @Column()
    productId: string;

    @ManyToOne(() => Product, (product) => product.stockMovements, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column()
    quantity: number;

    @Column()
    movementType: StockMovementType;

    @Column()
    referenceType: ReferenceType;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @DeleteDateColumn({ nullable: true })
    deletedAt: Date | null;

    // relationships
}   