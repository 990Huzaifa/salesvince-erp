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

export enum OpeningStockStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  FAILED = 'FAILED',
}

@Entity('opening_stocks')
export class OpeningStock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  businessId: string;

  @ManyToOne(() => Business, (business) => business.openingStocks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ unique: true })
  openingNumber: string;

  @Column()
  openingDate: Date;

  @Column()
  warehouseId: string;

  @ManyToOne(() => Warehouse, (warehouse) => warehouse.openingStocks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: Warehouse;

  @Column({ nullable: true })
  notes: string | null;

  @Column('uuid')
  createdBy: string;

  @ManyToOne(() => User, (user) => user.openingStocks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'createdBy' })
  createdByUser: User;

  @Column({
    type: 'enum',
    enum: OpeningStockStatus,
  })
  status: OpeningStockStatus;

  @Column({ type: 'uuid', nullable: true })
  jobId: string | null;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => OpeningStockItem, (item) => item.openingStock, {
    onDelete: 'CASCADE',
  })
  items: OpeningStockItem[];
}

@Entity('opening_stock_items')
export class OpeningStockItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  openingStockId: string;

  @ManyToOne(() => OpeningStock, (openingStock) => openingStock.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'openingStockId' })
  openingStock: OpeningStock;

  @Column()
  productId: string;

  @ManyToOne(() => Product, (product) => product.openingStockItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ nullable: true })
  productFlavourId: string | null;

  @ManyToOne(
    () => ProductFlavour,
    (productFlavour) => productFlavour.openingStockItems,
    { onDelete: 'CASCADE', nullable: true },
  )
  @JoinColumn({ name: 'productFlavourId' })
  productFlavour: ProductFlavour | null;

  @Column()
  uomId: string;

  @ManyToOne(() => Uom, (uom) => uom.openingStockItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'uomId' })
  uom: Uom;

  @Column()
  quantity: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  purchaseUnitPrice: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  saleUnitPrice: number;

  @Column({ nullable: true })
  batchNumber: string | null;

  @Column({ type: 'timestamp', nullable: true })
  expiryDate: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
