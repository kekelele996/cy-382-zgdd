import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TripEntity, TripMemberEntity, TripAccessService, TripModule } from '../trip';
import { DiaryController } from './diary.controller';
import { DiaryEntity } from './diary.entity';
import { DiaryParagraphEntity } from './diary-paragraph.entity';
import { DiaryService } from './diary.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DiaryEntity, DiaryParagraphEntity, TripEntity, TripMemberEntity]),
    forwardRef(() => TripModule)
  ],
  controllers: [DiaryController],
  providers: [DiaryService, TripAccessService],
  exports: [DiaryService]
})
export class DiaryModule {}
