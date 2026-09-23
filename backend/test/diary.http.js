/* HTTP 链路验证：真实 NestApplication + JWT 守卫 + ExceptionFilter + 路由。 */
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
const { HttpExceptionFilter } = require('../dist/common/filters/http-exception.filter');

class R {}
const testModule = {
  module: R,
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqljs',
      synchronize: true,
      entities: [UserEntity, TripEntity, TripMemberEntity, DiaryEntity, DiaryParagraphEntity]
    }),
    AuthModule,
    UserModule,
    TripModule,
    DiaryModule
  ]
};

(async () => {
  const app = await NestFactory.create(testModule, { logger: false });
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.listen(3099);
  const base = 'http://127.0.0.1:3099';

  const call = async (method, path, token, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  };

  // 未登录访问
  let r = await call('GET', '/api/trips/1/diary');
  assert.strictEqual(r.status, 401, '未登录 401');
  assert.strictEqual(r.json.code, 'AUTH_REQUIRED', '标准错误码');
  assert.strictEqual(r.json.success, false, '标准错误体 success=false');

  // 注册两个用户、建行程
  await call('POST', '/api/users/register', null, { email: 'a@x.com', nickname: 'Alice', password: 'pw' });
  await call('POST', '/api/users/register', null, { email: 'b@x.com', nickname: 'Bob', password: 'pw' });
  const aLogin = await call('POST', '/api/users/login', null, { email: 'a@x.com', password: 'pw' });
  const bLogin = await call('POST', '/api/users/login', null, { email: 'b@x.com', password: 'pw' });
  const aToken = aLogin.json.token;
  const bToken = bLogin.json.token;

  const created = await call('POST', '/api/trips', aToken, {
    destination: '丽江', departDate: '2099-03-01', days: 2, transport: '徒步'
  });
  assert.strictEqual(created.status, 201, '建行程成功');
  const tid = created.json.id;

  // 建行程必须登录
  r = await call('POST', '/api/trips', null, { destination: 'x', departDate: '2099-01-01', days: 1, transport: '自驾' });
  assert.strictEqual(r.status, 401, '匿名建行程 401');

  // Bob 加入
  r = await call('POST', `/api/trips/${tid}/join`, bToken);
  assert.strictEqual(r.status, 201, 'Bob 加入');

  // Bob 保存草稿（v0）
  r = await call('POST', `/api/trips/${tid}/diary/draft`, bToken, { version: 0, paragraphs: [{ content: 'Bob 起笔' }] });
  assert.strictEqual(r.status, 201, '首段草稿');
  assert.strictEqual(r.json.version, 1);

  // Alice 用旧版本 0 保存 -> 409 VERSION_CONFLICT
  r = await call('POST', `/api/trips/${tid}/diary/draft`, aToken, { version: 0, title: 'Alice 标题' });
  assert.strictEqual(r.status, 409, '过期版本 409');
  assert.strictEqual(r.json.code, 'VERSION_CONFLICT', '错误码 VERSION_CONFLICT');

  // Alice 刷新后看到版本一致、内容一致
  r = await call('GET', `/api/trips/${tid}/diary`, aToken);
  assert.strictEqual(r.json.version, 1, '刷新后版本一致');
  assert.strictEqual(r.json.paragraphs[0].content, 'Bob 起笔', '刷新后他人段落一致');
  assert.strictEqual(r.json.paragraphs[0].editable, false, 'Alice 不能编辑 Bob 段落');
  assert.strictEqual(r.json.frozen, false, '仍是草稿');

  // Alice 用最新版本保存成功
  r = await call('POST', `/api/trips/${tid}/diary/draft`, aToken, { version: 1, title: '丽江二日行' });
  assert.strictEqual(r.status, 201, '新版本保存成功');
  assert.strictEqual(r.json.version, 2);

  // 未结束发布 -> 409
  r = await call('POST', `/api/trips/${tid}/diary/publish`, aToken);
  assert.strictEqual(r.status, 409, '未结束不能发布');
  assert.strictEqual(r.json.code, 'TRIP_NOT_FINISHED');

  // Bob 尝试发布 -> 非发起人一律 403（权限校验先于行程状态）
  r = await call('POST', `/api/trips/${tid}/diary/publish`, bToken);
  assert.strictEqual(r.status, 403, '非发起人发布 403');
  assert.strictEqual(r.json.code, 'NOT_TRIP_OWNER');
  await call('POST', `/api/trips/${tid}/finish`, aToken);
  r = await call('POST', `/api/trips/${tid}/diary/publish`, bToken);
  assert.strictEqual(r.status, 403, '结束后非发起人仍 403');
  assert.strictEqual(r.json.code, 'NOT_TRIP_OWNER');

  // Alice 发布
  r = await call('POST', `/api/trips/${tid}/diary/publish`, aToken);
  assert.strictEqual(r.status, 201, '发起人发布成功');
  assert.strictEqual(r.json.frozen, true);
  const publishedVersion = r.json.version;
  assert.strictEqual(r.json.title, '丽江二日行', '标题冻结');
  assert.strictEqual(r.json.paragraphs[0].authorNickname, 'Bob', '昵称冻结');

  // 重复发布幂等
  r = await call('POST', `/api/trips/${tid}/diary/publish`, aToken);
  assert.strictEqual(r.status, 201, '重复发布不报错');
  assert.strictEqual(r.json.version, publishedVersion, '重复发布版本不变');

  // 发布后再保存 -> 409 DIARY_PUBLISHED
  r = await call('POST', `/api/trips/${tid}/diary/draft`, aToken, { version: publishedVersion, title: '偷改' });
  assert.strictEqual(r.status, 409, '发布后保存被拒');
  assert.strictEqual(r.json.code, 'DIARY_PUBLISHED');

  // 刷新后发布状态与版本稳定一致
  const ref1 = await call('GET', `/api/trips/${tid}/diary`, bToken);
  const ref2 = await call('GET', `/api/trips/${tid}/diary`, aToken);
  assert.strictEqual(ref1.json.status, 'PUBLISHED');
  assert.strictEqual(ref2.json.status, 'PUBLISHED');
  assert.strictEqual(ref1.json.version, ref2.json.version, '不同成员刷新看到相同版本');
  assert.deepStrictEqual(
    ref1.json.paragraphs.map(p => [p.authorNickname, p.content, p.sortOrder]),
    ref2.json.paragraphs.map(p => [p.authorNickname, p.content, p.sortOrder]),
    '不同成员刷新看到相同冻结快照'
  );

  // 离队 HTTP 链路
  const t2 = await call('POST', '/api/trips', aToken, { destination: '大理', departDate: '2099-05-01', days: 1, transport: '自驾' });
  await call('POST', `/api/trips/${t2.json.id}/join`, bToken);
  await call('POST', `/api/trips/${t2.json.id}/diary/draft`, bToken, { version: 0, paragraphs: [{ content: 'Bob 的段落' }] });
  r = await call('POST', `/api/trips/${t2.json.id}/leave`, bToken);
  assert.strictEqual(r.status, 201, '离队成功');
  r = await call('POST', `/api/trips/${t2.json.id}/diary/draft`, bToken, { version: 1, paragraphs: [{ content: '再改' }] });
  assert.strictEqual(r.status, 403, '离队后保存 403');
  r = await call('GET', `/api/trips/${t2.json.id}/diary`, bToken);
  assert.strictEqual(r.status, 200, '离队后仍可查看');
  assert.strictEqual(r.json.paragraphs[0].locked, true, '段落已冻结');
  assert.strictEqual(r.json.canEdit, false);

  await app.close();
  console.log('HTTP 链路全部通过 ✅');
})().catch(err => {
  console.error('HTTP 验证失败 ❌', err);
  process.exit(1);
});
