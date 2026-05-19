import { Column, CreateDateColumn, DeleteDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { User } from "./user.entity";

export enum AssetStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
}

@Entity('assets')
export class Asset {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({nullable: true})
    uploadedById: string;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'uploadedById' })
    uploadedByUser: User | null;

    @Column()
    purpose: string;

    @Column()
    s3Key: string;

    @Column({nullable: true})
    entityType: string;

    @Column({nullable: true})
    entityId: string;


    @Column()
    originalFileName: string;

    @Column()
    fileExtension: string;

    @Column()
    fileSize: number;



    @Column({ type: 'enum', enum: AssetStatus })
    status: AssetStatus;

    @Column({nullable: true})
    confirmedAt: Date | null;

    @Column({nullable: true})
    attachedAt: Date | null;

    @Column({nullable: true})
    deletedAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}