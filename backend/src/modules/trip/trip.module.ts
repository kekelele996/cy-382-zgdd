import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TripController } from './trip.controller';
import { TripMemberController } from './trip-member.controller';
import { TripEntity } from './trip.entity';
import { TripMemberEntity } from './trip-member.entity';
import { TripService } from './trip.service';
import { TripMemberService } from './trip-member.service';

@Module({
  imports: [TypeOrmModule.forFeature([TripEntity, TripMemberEntity])],
  controllers: [TripController, TripMemberController],
  providers: [TripService, TripMemberService],
  exports: [TypeOrmModule, TripService, TripMemberService]
})
export class TripModule {}
