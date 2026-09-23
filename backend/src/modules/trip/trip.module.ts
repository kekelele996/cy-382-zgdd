import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiaryModule } from '../diary/diary.module';
import { TripController } from './trip.controller';
import { TripMemberController } from './trip-member.controller';
import { TripEntity } from './trip.entity';
import { TripMemberEntity } from './trip-member.entity';
import { TripService } from './trip.service';
import { TripAccessService } from './trip-access.service';
import { TripMemberService } from './trip-member.service';

@Module({
  imports: [TypeOrmModule.forFeature([TripEntity, TripMemberEntity]), forwardRef(() => DiaryModule)],
  controllers: [TripController, TripMemberController],
  providers: [TripService, TripAccessService, TripMemberService],
  exports: [TypeOrmModule, TripAccessService]
})
export class TripModule {}
