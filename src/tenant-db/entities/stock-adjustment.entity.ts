import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Business } from './business.entity';
import { Warehouse } from './warehouse.entity';
import { User } from './user.entity';
import { Product, ProductFlavour, Uom } from './product.entity';

export enum StockAdjustmentStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum StockAdjustmentDirection {
  INCREASE = 'INCREASE',
  DECREASE = 'DECREASE',
}

@Entity('stock_adjustments')
export class StockAdjustment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  businessId: string;

  @ManyToOne(() => Business, (business) => business.stockAdjustments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ unique: true })
  adjustmentNumber: string;

  @Column()
  adjustmentDate: Date;

  @Column()
  warehouseId: string;

  @ManyToOne(() => Warehouse, (warehouse) => warehouse.stockAdjustments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: Warehouse;

  @Column({ nullable: true })
  notes: string | null;

  @Column('uuid')
  createdBy: string;

  @ManyToOne(() => User, (user) => user.stockAdjustments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'createdBy' })
  createdByUser: User;

  @Column({
    type: 'enum',
    enum: StockAdjustmentStatus,
  })
  status: StockAdjustmentStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => StockAdjustmentItem, (item) => item.stockAdjustment, {
    onDelete: 'CASCADE',
  })
  items: StockAdjustmentItem[];
}

@Entity('stock_adjustment_items')
export class StockAdjustmentItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  stockAdjustmentId: string;

  @ManyToOne(() => StockAdjustment, (adjustment) => adjustment.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'stockAdjustmentId' })
  stockAdjustment: StockAdjustment;

  @Column()
  productId: string;

  @ManyToOne(() => Product, (product) => product.stockAdjustmentItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ nullable: true })
  productFlavourId: string | null;

  @ManyToOne(
    () => ProductFlavour,
    (productFlavour) => productFlavour.stockAdjustmentItems,
    { onDelete: 'CASCADE', nullable: true },
  )
  @JoinColumn({ name: 'productFlavourId' })
  productFlavour: ProductFlavour | null;

  @Column()
  uomId: string;

  @ManyToOne(() => Uom, (uom) => uom.stockAdjustmentItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'uomId' })
  uom: Uom;

  @Column({
    type: 'enum',
    enum: StockAdjustmentDirection,
  })
  direction: StockAdjustmentDirection;

  @Column()
  quantity: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  purchaseUnitPrice: number | null;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  saleUnitPrice: number | null;

  @Column({ nullable: true })
  batchNumber: string | null;

  @Column({ type: 'timestamp', nullable: true })
  expiryDate: Date | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
