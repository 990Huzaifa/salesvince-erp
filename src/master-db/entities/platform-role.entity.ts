import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    OneToMany,
    ManyToMany,
    JoinTable,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { PlatformUser } from './platform-user.entity';
import { PlatformPermission } from './platform-premission.entity';

@Entity('platform_roles')
export class PlatformRole {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true })
    code: string; // SUPER_ADMIN, SUPPORT, etc.

    @Column()
    name: string;

    @Column({ default: true })
    isActive: boolean;

    // ✅ One Role → Many Users
    @OneToMany(() => PlatformUser, (user) => user.role)
    users: PlatformUser[];

    // ✅ One Role → Many Permissions
    @ManyToMany(() => PlatformPermission, (permission) => permission.roles, {
        eager: true, // auto load permissions
    })
    @JoinTable({
        name: 'platform_role_permissions',
        joinColumn: {
            name: 'role_id',
            referencedColumnName: 'id',
        },
        inverseJoinColumn: {
            name: 'permission_id',
            referencedColumnName: 'id',
        },
    })
    permissions: PlatformPermission[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
