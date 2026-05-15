import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';

@Entity('customers')
export class Customer {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    email: string;

    @Column()
    fullName: string;

    @Column()
    passwordHash: string;

    @Column({ default: true })
    isActive: boolean;

    @Column({ nullable: true })
    email_verified_at: Date;

    @Column()
    phone: string;

    @Column()
    country: string;

    @Column({ nullable: true })
    email_verification_otp: string;

    @Column({ type: 'timestamp', nullable: true })
    email_verification_otp_expires_at: Date;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
