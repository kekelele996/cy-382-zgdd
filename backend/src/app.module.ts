import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeormConfig } from './config/typeorm.config';
import { AuthModule } from './common/guards/auth.module';
import { UserModule } from './modules/user/user.module';
import { TripModule } from './modules/trip/trip.module';
import { CompanionModule } from './modules/companion/companion.module';
import { ChatModule } from './modules/chat/chat.module';
import { DiaryModule } from './modules/diary/diary.module';

@Module({ imports: [TypeOrmModule.forRoot(typeormConfig()), AuthModule, UserModule, TripModule, CompanionModule, ChatModule, DiaryModule] })
export class AppModule {}
