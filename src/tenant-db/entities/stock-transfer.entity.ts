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

export enum StockTransferStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  REVERSED = 'REVERSED',
}

@Entity('stock_transfers')
export class StockTransfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  businessId: string;

  @ManyToOne(() => Business, (business) => business.stockTransfers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ unique: true })
  transferNumber: string;

  @Column()
  transferDate: Date;

  @Column()
  fromWarehouseId: string;

  @ManyToOne(() => Warehouse, (warehouse) => warehouse.outgoingStockTransfers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'fromWarehouseId' })
  fromWarehouse: Warehouse;

  @Column()
  toWarehouseId: string;

  @ManyToOne(() => Warehouse, (warehouse) => warehouse.incomingStockTransfers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'toWarehouseId' })
  toWarehouse: Warehouse;

  @Column({ nullable: true })
  notes: string | null;

  @Column('uuid')
  createdBy: string;

  @ManyToOne(() => User, (user) => user.stockTransfers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'createdBy' })
  createdByUser: User;

  @Column({
    type: 'enum',
    enum: StockTransferStatus,
  })
  status: StockTransferStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => StockTransferItem, (item) => item.stockTransfer, {
    onDelete: 'CASCADE',
  })
  items: StockTransferItem[];
}

@Entity('stock_transfer_items')
export class StockTransferItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  stockTransferId: string;

  @ManyToOne(() => StockTransfer, (transfer) => transfer.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'stockTransferId' })
  stockTransfer: StockTransfer;

  @Column()
  productId: string;

  @ManyToOne(() => Product, (product) => product.stockTransferItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ nullable: true })
  productFlavourId: string | null;

  @ManyToOne(
    () => ProductFlavour,
    (productFlavour) => productFlavour.stockTransferItems,
    { onDelete: 'CASCADE', nullable: true },
  )
  @JoinColumn({ name: 'productFlavourId' })
  productFlavour: ProductFlavour | null;

  @Column()
  uomId: string;

  @ManyToOne(() => Uom, (uom) => uom.stockTransferItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'uomId' })
  uom: Uom;

  @Column()
  quantity: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
