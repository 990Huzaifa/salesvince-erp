import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToMany,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { PlatformRole } from './platform-role.entity';

@Entity('platform_permissions')
export class PlatformPermission {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    code: string; // CREATE_TENANT, SUSPEND_TENANT, etc.

    @Column()
    name: string;

    @Column({ default: true })
    isActive: boolean;

    // Reverse side
    @ManyToMany(() => PlatformRole, (role) => role.permissions)
    roles: PlatformRole[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
