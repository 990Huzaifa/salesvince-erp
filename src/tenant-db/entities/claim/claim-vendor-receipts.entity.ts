import { CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Claim } from "./claim.entity";

@Entity('claim_vendor_receipts')
export class ClaimVendorReceipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;


  @ManyToOne(() => Claim, (claim) => claim.vendorReceipts)
  @JoinColumn({ name: 'claimId' })
  claim: Claim;

  @OneToMany(() => ClaimVendorReceiptItem, (item) => item.receipt)
  items: ClaimVendorReceiptItem[];
}


@Entity('claim_vendor_receipt_items')
export class ClaimVendorReceiptItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ClaimVendorReceipt, (receipt) => receipt.items)
  @JoinColumn({ name: 'receiptId' })
  receipt: ClaimVendorReceipt;


  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}