import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TripModule } from '../trip/trip.module';
import { UserModule } from '../user/user.module';
import { DiaryController } from './diary.controller';
import { DiaryEntity } from './diary.entity';
import { DiaryParagraphEntity } from './diary-paragraph.entity';
import { DiaryService } from './diary.service';

@Module({
  imports: [TypeOrmModule.forFeature([DiaryEntity, DiaryParagraphEntity]), TripModule, UserModule],
  controllers: [DiaryController],
  providers: [DiaryService]
})
export class DiaryModule {}
