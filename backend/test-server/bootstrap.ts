import { INestApplication, Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule, InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { AuthModule } from '../src/common/guards/auth.module';
import { UserModule } from '../src/modules/user/user.module';
import { TripModule } from '../src/modules/trip/trip.module';
import { CompanionModule } from '../src/modules/companion/companion.module';
import { ChatModule } from '../src/modules/chat/chat.module';
import { DiaryModule } from '../src/modules/diary/diary.module';
import { TripStatus, MemberStatus } from '../src/constants/status';
import { UserEntity } from '../src/modules/user/user.entity';
import { TripEntity } from '../src/modules/trip/trip.entity';
import { TripMemberEntity } from '../src/modules/trip/trip-member.entity';

const DEMO_HASH = '$2a$10$U2Cwt7PiylYJz522gpDf3eF27nBarxiK/6j6LKlW3MLDoQZVpgWJi';

@Injectable()
export class Seeder {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}
  async run() {
    await this.ds.query('DELETE FROM diary_paragraphs');
    await this.ds.query('DELETE FROM diaries');
    await this.ds.query('DELETE FROM trip_members');
    await this.ds.query('DELETE FROM trips');
    await this.ds.query('DELETE FROM users');
    const users = this.ds.getRepository(UserEntity);
    const alice = await users.save(users.create({ id: 1, email: 'alice@example.com', nickname: 'Alice', passwordHash: DEMO_HASH }));
    const bob = await users.save(users.create({ id: 2, email: 'bob@example.com', nickname: 'Bob', passwordHash: DEMO_HASH }));
    await users.save(users.create({ id: 3, email: 'carol@example.com', nickname: 'Carol', passwordHash: DEMO_HASH }));
    const trips = this.ds.getRepository(TripEntity);
    const finished = await trips.save(trips.create({
      id: 1, ownerId: alice.id, destination: '大理', departDate: '2026-05-01', days: 5,
      budgetMin: 3500, budgetMax: 5200, transport: '公共交通', companionCount: 3, genderPreference: '不限', status: TripStatus.Finished
    }));
    await trips.save(trips.create({
      id: 2, ownerId: alice.id, destination: '青海湖', departDate: '2026-12-10', days: 7,
      budgetMin: 4800, budgetMax: 6800, transport: '自驾', companionCount: 3, genderPreference: '不限', status: TripStatus.Open
    }));
    const members = this.ds.getRepository(TripMemberEntity);
    await members.save([
      members.create({ tripId: finished.id, userId: 1, joinedNickname: 'Alice', status: MemberStatus.Active }),
      members.create({ tripId: finished.id, userId: 2, joinedNickname: 'Bob', status: MemberStatus.Active }),
      members.create({ tripId: finished.id, userId: 3, joinedNickname: 'Carol', status: MemberStatus.Left }),
      members.create({ tripId: 2, userId: 1, joinedNickname: 'Alice', status: MemberStatus.Active }),
      members.create({ tripId: 2, userId: 2, joinedNickname: 'Bob', status: MemberStatus.Active })
    ]);
  }
}

// 不引入 AppModule（其中硬编码了 MySQL forRoot），仅复用业务模块
@Module({
  imports: [
    TypeOrmModule.forRoot({ type: 'sqljs', autoSave: false, synchronize: true, autoLoadEntities: true, logging: false } as any),
    AuthModule,
    UserModule,
    TripModule,
    CompanionModule,
    ChatModule,
    DiaryModule
  ],
  providers: [Seeder]
})
class TestRoot {
  constructor(private readonly seeder: Seeder) {}
  async onApplicationBootstrap() {
    await this.seeder.run();
  }
}

export async function createTestApp(): Promise<INestApplication> {
  const app = await NestFactory.create(TestRoot, { logger: false });
  app.useGlobalFilters(new HttpExceptionFilter());
  return app;
}

if (require.main === module) {
  (async () => {
    const app = await createTestApp();
    await app.listen(3199);
    console.log('TEST_SERVER_UP');
  })();
}
