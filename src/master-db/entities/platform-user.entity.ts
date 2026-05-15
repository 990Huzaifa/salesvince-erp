import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    OneToMany,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { PlatformRole } from './platform-role.entity';
import { Notification } from './notification.entity';

@Entity('platform_users')
export class PlatformUser {
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

    // ✅ One User = One Role
    @ManyToOne(() => PlatformRole, (role) => role.users, {
        nullable: false,
        // eager: true, // auto load role
    })
    @JoinColumn({ name: 'role_id' })
    role: PlatformRole;

    @OneToMany(() => Notification, (notification) => notification.user)
    notifications: Notification[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

}
