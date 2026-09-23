import { createTestApp } from './bootstrap';
const BASE = 'http://127.0.0.1:3199';
async function req(method: string, path: string, token: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => null) };
}
(async () => {
  const app = await createTestApp();
  await app.listen(3199);
  const tok = async (e: string) => (await req('POST', '/api/users/login', null, { email: e, password: 'demo1234' })).json.token;
  const alice = await tok('alice@example.com');
  const bob = await tok('bob@example.com');

  // 双方都读到 v1，几乎同时提交
  await req('GET', '/api/trips/1/diary', alice);
  const aSave = req('PUT', '/api/trips/1/diary', alice, { version: 1, paragraphs: [{ content: 'Alice 并发段落' }] });
  const bSave = req('PUT', '/api/trips/1/diary', bob, { version: 1, paragraphs: [{ content: 'Bob 并发段落' }] });
  const [ar, br] = await Promise.all([aSave, bSave]);
  const successCount = [ar, br].filter(r => r.status === 200).length;
  const conflictCount = [ar, br].filter(r => r.status === 409 && r.json.code === 'DIARY_VERSION_CONFLICT').length;
  console.log('结果 A:', ar.status, ar.json.code ?? `v${ar.json.version}`);
  console.log('结果 B:', br.status, br.json.code ?? `v${br.json.version}`);
  console.log(`成功 ${successCount} 个，版本冲突 ${conflictCount} 个`);

  const finalState = await req('GET', '/api/trips/1/diary', alice);
  console.log('最终版本 v' + finalState.json.version, '段落数', finalState.json.paragraphs.length);
  const ok = successCount === 1 && conflictCount === 1 && finalState.json.version === 2 && finalState.json.paragraphs.length === 1;
  console.log(ok ? 'CONCURRENCY PASS: 同版本并发提交仅一次生效，另一次整次拒绝且服务端内容不被污染' : 'CONCURRENCY FAIL');
  await app.close();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
