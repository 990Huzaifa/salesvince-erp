import { Column, CreateDateColumn, DeleteDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Business } from "./business.entity";
import { Warehouse } from "./warehouse.entity";
import { Product, Uom } from "./product.entity";
import { Party } from "./party.entity";

export enum StockMovementType {
    IN = 'IN',
    OUT = 'OUT',
}

export enum ReferenceType {
    PURCHASE = 'PURCHASE',
    SALE = 'SALE',
    PURCHASE_RETURN = 'PURCHASE_RETURN',
    SALE_RETURN = 'SALE_RETURN',
    TRANSFER = 'TRANSFER',
    ADJUSTMENT = 'ADJUSTMENT',
    MERGE = 'MERGE',
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

    @Column({type: 'uuid'})
    vendorId: string;

    @ManyToOne(() => Party, (party) => party.batches, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'vendorId' })
    vendor: Party;

    @Column()
    batchNumber: string;
    
    @Column()
    productId: string;

    @ManyToOne(() => Product, (product) => product.batches, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column({ type: 'uuid' })
    uomId: string;

    @ManyToOne(() => Uom, (uom) => uom.batches, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'uomId' })
    uom: Uom;

    @Column()
    quantity: number;

    @Column({ type: 'decimal', precision: 18, scale: 2 })
    purchaseUnitPrice: number;

    @Column({ type: 'decimal', precision: 18, scale: 2 })
    saleUnitPrice: number;

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

}   

@Entity({ name: 'stock_balances' })
@Index('IDX_stock_balances_active_business_warehouse_product_uom', ['businessId', 'warehouseId', 'productId', 'uomId'], {
    unique: true,
    where: '"deletedAt" IS NULL',
})
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

    @Column({ type: 'uuid' })
    uomId: string;

    @ManyToOne(() => Uom, (uom) => uom.stockBalances, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'uomId' })
    uom: Uom;

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

    @Column({ type: 'uuid' })
    uomId: string;

    @ManyToOne(() => Uom, (uom) => uom.stockMovements, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'uomId' })
    uom: Uom;

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