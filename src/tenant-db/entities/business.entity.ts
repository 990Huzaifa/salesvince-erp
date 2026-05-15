import {
    Column,
    CreateDateColumn,
    DeleteDateColumn,
    Entity,
    Index,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import { UserBusiness } from './user-business.entity';
import { Role } from './role.entity';

export enum BusinessStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
    SUSPENDED = 'SUSPENDED',
}

@Entity('businesses')
export class Business {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Index({ unique: true })
    @Column({ type: 'varchar', length: 150 })
    name: string;

    @Column({ type: 'varchar', length: 180, nullable: true })
    legalName: string | null;

    @Column({ type: 'varchar', length: 10, default: 'PKR' })
    currency: string;

    @Column({ type: 'date', nullable: true })
    financialYearStart: Date | null;

    @Column({ type: 'date', nullable: true })
    financialYearEnd: Date | null;

    @Column({
        type: 'enum',
        enum: BusinessStatus,
        default: BusinessStatus.ACTIVE,
    })
    status: BusinessStatus;

    @OneToMany(() => UserBusiness, (userBusiness) => userBusiness.business)
    userBusinesses: UserBusiness[];

    @OneToMany(() => Role, (role) => role.business)
    roles: Role[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @DeleteDateColumn({ nullable: true })
    deletedAt: Date | null;
}