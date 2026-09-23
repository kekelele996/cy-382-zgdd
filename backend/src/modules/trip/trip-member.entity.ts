import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { MemberStatus } from '../../constants/status';

@Entity('trip_members')
@Index(['tripId', 'userId'], { unique: true })
export class TripMemberEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ name: 'trip_id' }) tripId!: number;
  @Column({ name: 'user_id' }) userId!: number;
  @Column({ name: 'joined_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' }) joinedAt!: Date;
  @Column({ name: 'left_at', type: 'datetime', nullable: true }) leftAt?: Date | null;
  @Column({ length: 20, default: MemberStatus.Active }) status!: string;
}
