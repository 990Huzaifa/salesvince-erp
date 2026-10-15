import { Column, CreateDateColumn, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Claim, ClaimBatch, ClaimItem } from "./claim.entity";
import { JoinColumn } from "typeorm";
import { Party } from "../party.entity";
import { Product, ProductFlavour, Uom } from "../product.entity";
import { Warehouse } from "../warehouse.entity";

export enum ClaimVendorShipmentStatus {
  PENDING = 'PENDING',
  SHIPPED = 'SHIPPED',
  CANCELLED = 'CANCELLED',
}

export enum ClaimVendorShipmentItemStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

@Entity('claim_vendor_shipments')
export class ClaimVendorShipment {
  @PrimaryGeneratedColumn('uuid')
  id: string;
    
  @Column({ unique: true })
  shipmentNumber: string;

  @Column({ type: 'date' })
  shipmentDate: Date;

  @Column({ type: 'uuid' })
  claimId: string;

  @ManyToOne(() => Claim, (claim) => claim.vendorShipments, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'claimId' })
  claim: Claim;

  @Column({ type: 'uuid' })
  vendorId: string;

  @ManyToOne(() => Party, (vendor) => vendor.vendorShipments, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'vendorId' })
  vendor: Party;

  @Column({ type: 'enum', enum: ClaimVendorShipmentStatus })
  shipmentStatus: ClaimVendorShipmentStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'text', nullable: true })
  proofImage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => ClaimVendorShipmentItem, (item) => item.shipment)
  items: ClaimVendorShipmentItem[];
}


@Entity('claim_vendor_shipment_items')
export class ClaimVendorShipmentItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  shipmentId: string;

  @ManyToOne(() => ClaimVendorShipment, (shipment) => shipment.items)
  @JoinColumn({ name: 'shipmentId' })
  shipment: ClaimVendorShipment;

  @Column({ type: 'uuid' })
  claimItemId: string;

  @ManyToOne(() => ClaimItem, (claimItem) => claimItem.shipmentItems)
  @JoinColumn({ name: 'claimItemId' })
  claimItem: ClaimItem;

  @ManyToOne(() => ClaimBatch, (claimBatch) => claimBatch.shipmentItems)
  @JoinColumn({ name: 'claimBatchId' })
  claimBatch: ClaimBatch;

  @Column({ type: 'uuid' })
  claimBatchId: string;

  @Column({ type: 'uuid' })
  warehouseId: string;

  @ManyToOne(() => Warehouse, (warehouse) => warehouse.claimVendorShipmentItems, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: Warehouse;

  @Column({ type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, (product) => product.claimVendorShipmentItems, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'uuid', nullable: true })
  productFlavourId: string | null;

  @ManyToOne(() => ProductFlavour, (productFlavour) => productFlavour.claimVendorShipmentItems, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'productFlavourId' })
  productFlavour: ProductFlavour | null;

  @Column({ type: 'uuid' })
  uomId: string;

  @ManyToOne(() => Uom, (uom) => uom.claimVendorShipmentItems, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'uomId' })
  uom: Uom; 

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'text', nullable: true })
  proofImage: string | null;

  @Column({ type: 'enum', enum: ClaimVendorShipmentItemStatus })
  status: ClaimVendorShipmentItemStatus;

  @Column({ type: 'text', nullable: true })
  rejectReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}