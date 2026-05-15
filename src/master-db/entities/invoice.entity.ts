import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Tenant } from "./tenant.entity";
import { Subscription } from "./subscription.entity";

export enum Status {
    DRAFT = 'DRAFT',
    ISSUE = 'ISSUE',
    PAID = 'PAID',
    OVERDUE = 'OVERDUE',
}

export enum PaymentMethod {
    CASH = 'CASH',
    CHEQUE = 'CHEQUE',
    TRANSFER = 'TRANSFER',
    ONLINE = 'ONLINE',
    OTHER = 'OTHER',
}

@Entity({ name: 'invoices' })
export class Invoice {

    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'tenant_id' })
    tenant: Tenant

    @ManyToOne(() => Subscription, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'subscription_id' })
    subscription: Subscription;

    @Column({ type: 'enum', enum: Status })
    status: Status;

    @Column()
    issueDate: Date;

    @Column()
    dueDate: Date;

    @Column()
    subTotalAmount: number;

    @Column()
    taxAmount: number;

    @Column()
    totalAmount: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => InvoiceItem, (invoiceItem) => invoiceItem.invoice)
    invoiceItems: InvoiceItem[];

}

@Entity({ name: 'invoice_items' })
export class InvoiceItem {

    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Invoice, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'invoice_id' })
    invoice: Invoice;

    @Column()
    name: string;

    @Column()
    quantity: number;

    @Column()
    unitPrice: number;

    @Column()
    totalAmount: number;

}

@Entity({ name: 'invoice_payments' })
export class InvoicePayment {

    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Invoice, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'invoice_id' })
    invoice: Invoice;

    @Column()
    paymentDate: Date;

    @Column()
    amount: string;

    @Column({ type: 'enum', enum: PaymentMethod })
    method: PaymentMethod;

    @Column({nullable: true})
    remarks?: string;

    @Column({nullable: true})
    reference?: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

}