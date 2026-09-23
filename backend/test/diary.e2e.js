/* 端到端业务验证：内存 SQLite 驱动真实的 Nest/TypeORM 服务层。
   覆盖：成员权限、段落归属、版本乐观锁、离队冻结、发布条件与幂等、快照冻结、自动结束。 */
const assert = require('assert');
const { NestFactory } = require('@nestjs/core');
const { DataSource } = require('typeorm');
const { TypeOrmModule } = require('@nestjs/typeorm');

const { AuthModule } = require('../dist/common/auth/auth.module');
const { UserModule } = require('../dist/modules/user/user.module');
const { UserEntity } = require('../dist/modules/user/user.entity');
const { TripEntity } = require('../dist/modules/trip/trip.entity');
const { TripMemberEntity } = require('../dist/modules/trip/trip-member.entity');
const { DiaryEntity } = require('../dist/modules/diary/diary.entity');
const { DiaryParagraphEntity } = require('../dist/modules/diary/diary-paragraph.entity');
const { TripModule } = require('../dist/modules/trip/trip.module');
const { DiaryModule } = require('../dist/modules/diary/diary.module');
const { UserService } = require('../dist/modules/user/user.service');
const { TripService } = require('../dist/modules/trip/trip.service');
const { TripMemberService } = require('../dist/modules/trip/trip-member.service');
const { DiaryService } = require('../dist/modules/diary/diary.service');

let stepNo = 0;
const step = (name) => console.log(`${String(++stepNo).padStart(2, '0')}. ${name}`);
const ok = (cond, msg) => assert.ok(cond, msg);

async function expectFail(fn, code, msg) {
  try {
    await fn();
  } catch (err) {
    if (err && err.code === code) return err;
    throw new assert.AssertionError({ message: `${msg}：期望错误码 ${code}，实际 ${err && err.code} / ${err && err.message}` });
  }
  throw new assert.AssertionError({ message: `${msg}：本应抛出 ${code} 但成功了` });
}

class TestRoot {}

const testModule = {
  module: TestRoot,
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqljs',
      autoSave: false,
      synchronize: true,
      logging: false,
      entities: [UserEntity, TripEntity, TripMemberEntity, DiaryEntity, DiaryParagraphEntity]
    }),
    AuthModule,
    UserModule,
    TripModule,
    DiaryModule
  ]
};

async function makeTrip(tripService, ownerId, departDate, days) {
  return tripService.create({
    ownerId,
    destination: '测试地',
    departDate,
    days,
    transport: '公共交通',
    companionCount: 3
  });
}

(async () => {
  const app = await NestFactory.createApplicationContext(testModule, { logger: false });
  const users = app.get(UserService);
  const trips = app.get(TripService);
  const members = app.get(TripMemberService);
  const diaries = app.get(DiaryService);
  const ds = app.get(DataSource);

  await users.register('alice@x.com', 'Alice', 'pw');
  await users.register('bob@x.com', 'Bob', 'pw');
  await users.register('carol@x.com', 'Carol', 'pw');
  const alice = { userId: 1, nickname: 'Alice' };
  const bob = { userId: 2, nickname: 'Bob' };
  const carol = { userId: 3, nickname: 'Carol' };

  // 未来行程（进行中语义）
  const trip = await makeTrip(trips, alice.userId, '2099-01-01', 5);
  const tid = trip.id;

  step('非成员不能查看日记');
  await expectFail(() => diaries.view(tid, bob.userId), 'NOT_TRIP_MEMBER', '非成员查看');

  step('发起人加入被拒绝；普通成员可加入');
  await expectFail(() => members.join(tid, alice.userId), 'VALIDATION_FAILED', '发起人加入');
  await members.join(tid, bob.userId);
  await members.join(tid, carol.userId);

  step('行程结束前保存草稿是允许的（只是不能发布）');
  let v = await diaries.view(tid, bob.userId);
  ok(v.canEdit === true && v.canPublish === false && v.frozen === false, '草稿态可编辑不可发布');
  v = await diaries.saveDraft(tid, bob.userId, 'Bob', { version: 0, title: '大理之行', paragraphs: [{ content: 'Bob 第一段' }] });
  ok(v.version === 1 && v.paragraphs.length === 1, '保存成功版本号变为 1');

  step('其他人不能修改 Bob 创建的段落，整次修改被拒绝');
  await expectFail(
    () => diaries.saveDraft(tid, carol.userId, 'Carol', { version: 1, paragraphs: [{ id: v.paragraphs[0].id, content: 'Carol 篡改' }] }),
    'PARAGRAPH_FORBIDDEN',
    '他人段落'
  );

  step('整次拒绝后服务端内容和版本号不动');
  const afterForbidden = await diaries.view(tid, bob.userId);
  ok(afterForbidden.version === 1, '版本仍是 1');
  ok(afterForbidden.paragraphs[0].content === 'Bob 第一段', '内容未被改');

  step('版本号过期整次拒绝（即使改的是自己的段落）');
  await diaries.saveDraft(tid, carol.userId, 'Carol', { version: 1, paragraphs: [{ content: 'Carol 第一段' }] });
  await expectFail(
    () => diaries.saveDraft(tid, bob.userId, 'Bob', { version: 1, paragraphs: [{ id: afterForbidden.paragraphs[0].id, content: 'Bob 用旧版本号改' }] }),
    'VERSION_CONFLICT',
    '过期版本号'
  );
  const afterConflict = await diaries.view(tid, carol.userId);
  ok(afterConflict.version === 2, '版本停在 2');
  ok(afterConflict.paragraphs.find(p => p.authorId === bob.userId).content === 'Bob 第一段', 'Bob 的段落未被动');

  step('成员离队：段落仍可查看，但本人和他人都不能再改');
  await members.leave(tid, bob.userId);
  const leftView = await diaries.view(tid, bob.userId);
  ok(leftView.canEdit === false, '离队成员不能编辑');
  ok(leftView.paragraphs.find(p => p.authorId === bob.userId).locked === true, '其段落被冻结');
  ok(leftView.paragraphs.find(p => p.authorId === carol.userId).locked === false, '他人段落不被连坐');
  await expectFail(() => diaries.saveDraft(tid, bob.userId, 'Bob', { version: 2, title: 'x' }), 'NOT_TRIP_MEMBER', '离队后保存');
  const lockedParagraph = leftView.paragraphs.find(p => p.authorId === bob.userId);
  await expectFail(
    () => diaries.saveDraft(tid, carol.userId, 'Carol', { version: 2, paragraphs: [{ id: lockedParagraph.id, content: 'Carol 改离队者段落' }] }),
    'PARAGRAPH_FORBIDDEN',
    '修改离队者段落'
  );

  step('行程未结束：普通成员和发起人都不能发布');
  await expectFail(() => diaries.publish(tid, carol.userId), 'NOT_TRIP_OWNER', '非发起人发布');
  await expectFail(() => diaries.publish(tid, alice.userId), 'TRIP_NOT_FINISHED', '结束前发布');

  step('只有发起人能结束行程，结束后发起人才能发布');
  await expectFail(() => members.finish(tid, carol.userId), 'NOT_TRIP_OWNER', '非发起人结束');
  await members.finish(tid, alice.userId);

  step('发布：冻结标题、段落顺序与昵称快照');
  const before = await diaries.view(tid, alice.userId);
  const orderBefore = before.paragraphs.map(p => [p.authorNickname, p.content]);
  const published = await diaries.publish(tid, alice.userId);
  ok(published.frozen === true && published.status === 'PUBLISHED', '已发布冻结');
  ok(published.canEdit === false && published.canPublish === false, '发布后不可编辑/不可再发布');
  assert.deepStrictEqual(
    published.paragraphs.map(p => [p.authorNickname, p.content]),
    orderBefore,
    '顺序和昵称与发布时一致'
  );

  step('发布后任何人保存都被拒绝，服务端内容不动');
  await expectFail(() => diaries.saveDraft(tid, carol.userId, 'Carol', { version: published.version, title: '改标题' }), 'DIARY_PUBLISHED', '发布后改标题');
  await expectFail(() => diaries.saveDraft(tid, carol.userId, 'Carol', { version: published.version, paragraphs: [{ content: '新段落' }] }), 'DIARY_PUBLISHED', '发布后加段落');
  const checkRow = await ds.getRepository(DiaryEntity).findOneBy({ tripId: tid });
  ok(checkRow.title === '大理之行', '标题未被改');

  step('昵称冻结：发布后改昵称不影响已发布日记');
  await ds.query("UPDATE users SET nickname = 'Bob改名了' WHERE id = 2");
  const publishedAgain = await diaries.publish(tid, alice.userId); // 重复发布
  ok(publishedAgain.version === published.version, '重复发布不改版本');
  ok(publishedAgain.paragraphs.find(p => p.authorId === 2).authorNickname === 'Bob', '发布快照昵称仍是 Bob');
  const rows = await ds.getRepository(DiaryParagraphEntity).find();
  ok(rows.length === 2, '重复发布不产生重复数据');

  step('重新入队也不能改此前被冻结的段落（另一个未结束行程）');
  const trip2 = await makeTrip(trips, alice.userId, '2099-02-01', 3);
  await members.join(trip2.id, bob.userId);
  let d2 = await diaries.saveDraft(trip2.id, bob.userId, 'Bob', { version: 0, paragraphs: [{ content: 'Bob 在行程2的段落' }] });
  await members.leave(trip2.id, bob.userId);
  await members.join(trip2.id, bob.userId);
  d2 = await diaries.view(trip2.id, bob.userId);
  ok(d2.canEdit === true, '重新入队恢复编辑权');
  const locked2 = d2.paragraphs.find(p => p.authorId === bob.userId);
  ok(locked2.locked === true, '旧段落保持冻结');
  await expectFail(
    () => diaries.saveDraft(trip2.id, bob.userId, 'Bob', { version: 1, paragraphs: [{ id: locked2.id, content: '重新入队改旧段落' }] }),
    'PARAGRAPH_FORBIDDEN',
    '重新入队改旧段落'
  );
  const d2b = await diaries.saveDraft(trip2.id, bob.userId, 'Bob', { version: 1, paragraphs: [{ content: '重新入队后新段落' }] });
  ok(d2b.paragraphs.length === 2, '仍可写新段落');

  step('发起人不能离队');
  await expectFail(() => members.leave(trip2.id, alice.userId), 'OWNER_CANNOT_LEAVE', '发起人离队');

  step('自动结束：出发日期+天数已过的行程视为结束，可直接发布');
  const trip3 = await makeTrip(trips, alice.userId, '2000-01-01', 2);
  await members.join(trip3.id, carol.userId);
  await diaries.saveDraft(trip3.id, carol.userId, 'Carol', { version: 0, title: '陈年游记', paragraphs: [{ content: '老照片' }] });
  const pub3 = await diaries.publish(trip3.id, alice.userId);
  ok(pub3.frozen === true && pub3.title === '陈年游记', '日期已过的行程无需手动结束即可发布');
  const pub3again = await diaries.publish(trip3.id, alice.userId);
  ok(pub3again.version === pub3.version, '重复发布幂等版本不变');

  step('段落顺序按创建追加，发布快照保留该顺序');
  const trip4 = await makeTrip(trips, alice.userId, '2001-01-01', 1);
  await members.join(trip4.id, bob.userId);
  await members.join(trip4.id, carol.userId);
  let d4 = await diaries.view(trip4.id, alice.userId);
  d4 = await diaries.saveDraft(trip4.id, bob.userId, 'Bob', {
    version: d4.version,
    paragraphs: [{ content: '第一' }, { content: '第二' }]
  });
  assert.deepStrictEqual(d4.paragraphs.map(x => [x.content, x.sortOrder]), [['第一', 0], ['第二', 1]], '一次保存多段落顺序递增');
  d4 = await diaries.saveDraft(trip4.id, carol.userId, 'Carol', { version: d4.version, paragraphs: [{ content: '第三' }] });
  d4 = await diaries.saveDraft(trip4.id, alice.userId, 'Alice', { version: d4.version, paragraphs: [{ content: '第四' }] });
  const p4 = await diaries.publish(trip4.id, alice.userId);
  assert.deepStrictEqual(p4.paragraphs.map(x => x.content), ['第一', '第二', '第三', '第四'], '顺序冻结为追加顺序');

  await app.close();
  console.log('\n全部场景通过 ✅');
})().catch(err => {
  console.error('\n验证失败 ❌');
  console.error(err);
  process.exit(1);
});
