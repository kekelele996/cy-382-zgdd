/* eslint-disable no-console */
import { createTestApp } from './bootstrap';

const BASE = 'http://127.0.0.1:3199';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${name}`, detail === undefined ? '' : JSON.stringify(detail));
  }
}

async function request(method: string, path: string, token: string | null, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function login(email: string): Promise<string> {
  const { json } = await request('POST', '/api/users/login', null, { email, password: 'demo1234' });
  return json.token;
}

async function main() {
  const app = await createTestApp();
  await app.listen(3199);

  const alice = await login('alice@example.com');
  const bob = await login('bob@example.com');
  const carol = await login('carol@example.com');
  check('三个演示用户均可登录', Boolean(alice && bob && carol));

  // 1. 鉴权：未登录不能访问
  {
    const r = await request('GET', '/api/trips/1/diary', null);
    check('未登录访问日记返回 401', r.status === 401, r.json);
  }

  // 2. 非成员不能查看
  {
    // Carol 是成员（离队），需要一个真正的非成员：新建用户
    await request('POST', '/api/users/register', null, { email: 'dave@example.com', nickname: 'Dave', password: 'demo1234' });
    const dave = await login('dave@example.com');
    const r = await request('GET', '/api/trips/1/diary', dave);
    check('非行程成员查看日记返回 403', r.status === 403 && r.json.code === 'NOT_TRIP_MEMBER', r.json);
  }

  // 3. 首次获取自动创建草稿 v1
  const g1 = await request('GET', '/api/trips/1/diary', alice);
  check('成员首次查看自动建立草稿 v1', g1.status === 200 && g1.json.version === 1 && g1.json.status === 'DRAFT', g1.json);
  check('已结束行程发起人 canPublish=true', g1.json.permissions.canPublish === true, g1.json.permissions);
  check('草稿期 canEdit=true', g1.json.permissions.canEdit === true, g1.json.permissions);

  // 4. 未结束行程：只能存草稿，发起人不能发布
  {
    const g = await request('GET', '/api/trips/2/diary', alice);
    check('未结束行程 canPublish=false', g.json.permissions.canPublish === false, g.json.permissions);
    const p = await request('POST', '/api/trips/2/diary/publish', alice, {});
    check('行程未结束发起人发布被拒 TRIP_NOT_FINISHED', p.status === 409 && p.json.code === 'TRIP_NOT_FINISHED', p.json);
  }

  // 5. 多人共写：Alice 与 Bob 各写本人段落
  const sa = await request('PUT', '/api/trips/1/diary', alice, {
    version: 1,
    title: '大理风与洱海',
    paragraphs: [{ content: 'Alice 段落：古城集合' }, { content: 'Alice 段落：喜洲粑粑' }]
  });
  check('Alice 保存草稿成功 -> v2', sa.status === 200 && sa.json.version === 2 && sa.json.paragraphs.length === 2, sa.json);

  // Bob 拿着旧版本号 v1 保存 -> 整次拒绝，服务端内容不动
  const staleBob = await request('PUT', '/api/trips/1/diary', bob, {
    version: 1,
    paragraphs: [{ content: 'Bob 拿着过期版本写的内容' }]
  });
  check('版本过期整次拒绝 409', staleBob.status === 409 && staleBob.json.code === 'DIARY_VERSION_CONFLICT', staleBob.json);
  const afterStale = await request('GET', '/api/trips/1/diary', bob);
  check('冲突后服务端版本/内容不变', afterStale.json.version === 2 && afterStale.json.paragraphs.length === 2, afterStale.json);

  // Bob 刷新后用 v2 保存自己的段落
  const sb = await request('PUT', '/api/trips/1/diary', bob, {
    version: 2,
    paragraphs: [{ content: 'Bob 段落：骑行环洱海' }]
  });
  check('Bob 基于最新版本保存成功 -> v3', sb.status === 200 && sb.json.version === 3 && sb.json.paragraphs.length === 3, sb.json);

  // 6. 成员只能改本人创建的段落：Bob 试图改 Alice 的段落 -> 整次拒绝
  const aliceParaId = sa.json.paragraphs.find((p: any) => p.authorId === 1).id;
  const bobParaId = sb.json.paragraphs.find((p: any) => p.authorId === 2).id;
  const hijack = await request('PUT', '/api/trips/1/diary', bob, {
    version: 3,
    paragraphs: [{ existingId: aliceParaId, content: 'Bob 篡改 Alice 的段落' }]
  });
  check('改他人段落整次拒绝 NOT_PARAGRAPH_AUTHOR', hijack.status === 403 && hijack.json.code === 'NOT_PARAGRAPH_AUTHOR', hijack.json);
  // 同次里 Bob 自己段落的合法修改也必须随整次回滚
  const afterHijack = await request('GET', '/api/trips/1/diary', bob);
  check('整次回滚：服务端仍为 v3，Alice 段落未变',
    afterHijack.json.version === 3 &&
    afterHijack.json.paragraphs.find((p: any) => p.id === aliceParaId).content === 'Alice 段落：古城集合',
    afterHijack.json);

  // 7. 删除他人段落同样拒绝
  const delOther = await request('PUT', '/api/trips/1/diary', bob, { version: 3, deleteParagraphIds: [aliceParaId] });
  check('删除他人段落被拒', delOther.status === 403 && delOther.json.code === 'NOT_PARAGRAPH_AUTHOR', delOther.json);

  // 8. 删除本人段落成功
  const delOwn = await request('PUT', '/api/trips/1/diary', bob, { version: 3, deleteParagraphIds: [bobParaId] });
  check('删除本人段落成功 -> v4，剩余 2 段', delOwn.status === 200 && delOwn.json.version === 4 && delOwn.json.paragraphs.length === 2, delOwn.json);

  // Bob 重新写一段用于排序/发布演示
  const sb2 = await request('PUT', '/api/trips/1/diary', bob, { version: 4, paragraphs: [{ content: 'Bob 段落：骑行环洱海' }] });
  check('Bob 重新补段落 -> v5，共 3 段', sb2.status === 200 && sb2.json.version === 5 && sb2.json.paragraphs.length === 3, sb2.json);
  const newBobParaId = sb2.json.paragraphs.find((p: any) => p.authorId === 2).id;

  // 9. 段落排序：他人段落相对顺序不能变
  const orderedIds = sb2.json.paragraphs.map((p: any) => p.id);
  // 当前顺序 A A B；试图改成 B A A —— 两 Alice 段相对顺序未变，但 Bob 只能与相邻本人段交换，
  // 服务端规则是"他人段落相对顺序不变"：B A A 中 Alice 两段相对顺序仍是原来的，应允许
  const allowReorder = await request('POST', '/api/trips/1/diary/reorder', bob, { version: 5, paragraphIds: [newBobParaId, orderedIds[0], orderedIds[1]] });
  check('在不改变他人段落相对顺序时允许重排 -> v6', allowReorder.status === 200 && allowReorder.json.version === 6, allowReorder.json);
  // Alice 两段落相对顺序被颠倒 -> 拒绝
  const badReorder = await request('POST', '/api/trips/1/diary/reorder', bob, { version: 6, paragraphIds: [newBobParaId, orderedIds[1], orderedIds[0]] });
  check('颠倒他人段落相对顺序被拒', badReorder.status === 403 && badReorder.json.code === 'NOT_PARAGRAPH_AUTHOR', badReorder.json);
  // 旧版本号排序 -> 冲突
  const staleReorder = await request('POST', '/api/trips/1/diary/reorder', alice, { version: 1, paragraphIds: orderedIds });
  check('用旧版本号排序触发版本冲突', staleReorder.status === 409 && staleReorder.json.code === 'DIARY_VERSION_CONFLICT', staleReorder.json);

  // 10. 离队成员：段落可查看但不能改
  const carolView = await request('GET', '/api/trips/1/diary', carol);
  check('离队成员仍可查看日记', carolView.status === 200 && carolView.json.permissions.active === false, carolView.json);
  // Carol 先作为在队成员留一个段落，再离队：用 Alice 视角无法直接改其成员状态，
  // 直接调用离队接口（Carol 已在 LEFT 状态）-> 应 403；改用 Bob 离队验证可再改规则
  const carolWrite = await request('PUT', '/api/trips/1/diary', carol, { version: 6, paragraphs: [{ content: 'Carol 离队后偷写' }] });
  check('离队成员不能新增/修改段落 MEMBER_LEFT', carolWrite.status === 403 && carolWrite.json.code === 'MEMBER_LEFT', carolWrite.json);

  // Bob 离队后本人历史段落不可再改，重新加入恢复
  await request('DELETE', '/api/trips/1/members/me', bob);
  const bobLeftWrite = await request('PUT', '/api/trips/1/diary', bob, { version: 6, paragraphs: [{ existingId: newBobParaId, content: 'Bob 离队后改自己的段落' }] });
  check('在队成员离队后本人段落也不可再改', bobLeftWrite.status === 403 && bobLeftWrite.json.code === 'MEMBER_LEFT', bobLeftWrite.json);
  const rejoin = await request('POST', '/api/trips/1/members', bob);
  check('离队成员可重新加入（记录恢复 ACTIVE）', rejoin.status === 200 && rejoin.json.status === 'ACTIVE', rejoin.json);
  const bobRejoinWrite = await request('PUT', '/api/trips/1/diary', bob, { version: 6, paragraphs: [{ existingId: newBobParaId, content: 'Bob 归队后更新段落' }] });
  check('重新加入后可继续改本人段落 -> v7', bobRejoinWrite.status === 200 && bobRejoinWrite.json.version === 7, bobRejoinWrite.json);

  // 11. 非发起人不能发布
  const bobPublish = await request('POST', '/api/trips/1/diary/publish', bob, {});
  check('普通成员发布被拒 NOT_TRIP_OWNER', bobPublish.status === 403 && bobPublish.json.code === 'NOT_TRIP_OWNER', bobPublish.json);

  // 12. 发起人发布：冻结标题、顺序、昵称
  const before = await request('GET', '/api/trips/1/diary', alice);
  const pub = await request('POST', '/api/trips/1/diary/publish', alice, {});
  check('发起人发布成功 -> PUBLISHED 且版本号递增', pub.status === 200 && pub.json.status === 'PUBLISHED' && pub.json.version === before.json.version + 1, pub.json);
  check('发布冻结标题快照', pub.json.title === before.json.title && pub.json.publishedTitle === before.json.title, { title: pub.json.title, snapshot: pub.json.publishedTitle });
  const seqFrozen = pub.json.paragraphs.map((p: any) => p.seq).join(',');
  check('发布后段落顺序为连续冻结顺序', seqFrozen === '0,1,2', pub.json.paragraphs.map((p: any) => ({ id: p.id, seq: p.seq })));
  const nicknames = [...new Set(pub.json.paragraphs.map((p: any) => p.authorNickname))].sort().join(',');
  check('发布冻结作者昵称', nicknames === 'Alice,Bob', nicknames);

  // 13. 发布后任何人不能再改（含发起人、本人段落）
  const editAfter = await request('PUT', '/api/trips/1/diary', alice, { version: pub.json.version, paragraphs: [{ existingId: orderedIds[0], content: '发布后还想改' }] });
  check('发布后发起人也不能改 DIARY_PUBLISHED', editAfter.status === 409 && editAfter.json.code === 'DIARY_PUBLISHED', editAfter.json);
  const reorderAfter = await request('POST', '/api/trips/1/diary/reorder', bob, { version: pub.json.version, paragraphIds: orderedIds });
  check('发布后顺序冻结不能调', reorderAfter.status === 409 && reorderAfter.json.code === 'DIARY_PUBLISHED', reorderAfter.json);
  const carolEditAfter = await request('PUT', '/api/trips/1/diary', carol, { version: pub.json.version, title: 'Carol 改标题' });
  check('发布后离队成员同样不能改（403/409 任一拒绝即可）', carolEditAfter.status === 403 || carolEditAfter.status === 409, carolEditAfter.json);

  // 14. 重复发布只生效一次：幂等返回同版本同发布时间，不再次递增
  const republish = await request('POST', '/api/trips/1/diary/publish', alice, {});
  check('重复发布幂等：版本/发布时间不变', republish.status === 200 && republish.json.version === pub.json.version && republish.json.publishedAt === pub.json.publishedAt, { first: pub.json.publishedAt, again: republish.json.publishedAt });

  // 15. 刷新后版本冲突与发布状态一致
  const refreshed = await request('GET', '/api/trips/1/diary', bob);
  check('刷新后拿到发布状态与最新版本', refreshed.json.status === 'PUBLISHED' && refreshed.json.version === pub.json.version, refreshed.json);
  const staleSaveAfterRefresh = await request('PUT', '/api/trips/1/diary', bob, { version: 999, title: '乱序保存' });
  check('发布态下旧版本保存仍被拒（状态一致）', staleSaveAfterRefresh.status === 409, staleSaveAfterRefresh.json);

  // 16. 409 响应携带服务端最新内容，便于前端刷新合并
  const conflictData = staleBob.json.data;
  check('版本冲突响应带服务端最新日记数据', Boolean(conflictData && conflictData.version === 2 && conflictData.paragraphs.length === 2), conflictData);

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  await app.close();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
