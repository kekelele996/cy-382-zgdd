import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Row,
  Space,
  Spin,
  Tag,
  Typography
} from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CheckCircleFilled,
  EditOutlined,
  LogoutOutlined,
  PlusOutlined,
  ReloadOutlined,
  TeamOutlined,
  UserAddOutlined,
  UserDeleteOutlined
} from '@ant-design/icons';
import { ApiError, authApi, clearSession, getSavedUser, saveSession } from '../../api';
import {
  Diary,
  DiaryStatus,
  ParagraphInput,
  TripInfo,
  TripMember,
  diaryApi,
  tripApi
} from './types';

interface DraftState {
  title: string;
  edits: Record<number, string>;
  deletes: number[];
  newParas: string[];
}

function buildDraft(diary: Diary): DraftState {
  return {
    title: diary.title,
    edits: {},
    deletes: [],
    newParas: []
  };
}

function isConflict(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.body.code === 'DIARY_VERSION_CONFLICT' || error.status === 409);
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.body.message : error instanceof Error ? error.message : '操作失败';
}

export default function DiaryPage() {
  const { message, modal } = AntApp.useApp();
  const [user, setUser] = useState(getSavedUser());

  if (!user) return <LoginCard onLogin={setUser} />;

  return (
    <DiaryWorkspace
      currentUser={user}
      onLogout={() => {
        clearSession();
        setUser(null);
      }}
      messageApi={message}
      modalApi={modal}
    />
  );
}

function LoginCard({ onLogin }: { onLogin: (user: { id: number; nickname: string }) => void }) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const values = await form.validateFields();
    setLoading(true);
    try {
      const result = mode === 'login'
        ? await authApi.login(values.email, values.password)
        : await authApi.register(values.email, values.nickname ?? values.email.split('@')[0], values.password);
      if (!result?.token) {
        message.error('登录失败，请检查邮箱或密码');
        return;
      }
      saveSession(result.token, result.user);
      message.success(`欢迎，${result.user.nickname}`);
      onLogin(result.user);
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: '64px auto' }}>
      <Card>
        <Typography.Title level={3}>{mode === 'login' ? '登录 TripMatch' : '注册账号'}</Typography.Title>
        <Form form={form} layout="vertical" onFinish={submit} initialValues={{ email: 'alice@example.com', password: 'demo1234' }}>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, message: '请输入邮箱' }]}>
            <Input placeholder="alice@example.com" />
          </Form.Item>
          {mode === 'register' && (
            <Form.Item name="nickname" label="昵称" rules={[{ required: true, message: '请输入昵称' }]}>
              <Input placeholder="旅行昵称" />
            </Form.Item>
          )}
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password placeholder="演示口令 demo1234" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading} icon={<UserAddOutlined />}>
            {mode === 'login' ? '登录' : '注册并登录'}
          </Button>
        </Form>
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <Button type="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
          </Button>
        </div>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          演示账号：alice / bob / carol@example.com，口令均为 demo1234（Carol 在大理行程中已离队）。
        </Typography.Paragraph>
      </Card>
    </div>
  );
}

function DiaryWorkspace({
  currentUser,
  onLogout,
  messageApi,
  modalApi
}: {
  currentUser: { id: number; nickname: string };
  onLogout: () => void;
  messageApi: ReturnType<typeof AntApp.useApp>['message'];
  modalApi: ReturnType<typeof AntApp.useApp>['modal'];
}) {
  const [tripId, setTripId] = useState(1);
  const [trip, setTrip] = useState<TripInfo | null>(null);
  const [members, setMembers] = useState<TripMember[]>([]);
  const [diary, setDiary] = useState<Diary | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const applyDiary = useCallback((next: Diary) => {
    setDiary(next);
    setDraft(prev => (prev ? { ...buildDraft(next), newParas: prev.newParas } : buildDraft(next)));
  }, []);

  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [tripInfo, memberList, diaryInfo] = await Promise.all([
          tripApi.detail(tripId),
          tripApi.members(tripId),
          diaryApi.get(tripId)
        ]);
        setTrip(tripInfo);
        setMembers(memberList);
        applyDiary(diaryInfo);
      } catch (error) {
        if (!silent) messageApi.error(errorMessage(error));
      } finally {
        setLoading(false);
      }
    },
    [tripId, applyDiary, messageApi]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 轮询：刷新后若版本/发布状态变化，本地会与服务端保持一致
  useEffect(() => {
    const timer = setInterval(() => refresh(true), 15000);
    return () => clearInterval(timer);
  }, [refresh]);

  const dirty = useMemo(() => {
    if (!diary || !draft) return false;
    return (
      draft.title.trim() !== diary.title ||
      Object.keys(draft.edits).length > 0 ||
      draft.deletes.length > 0 ||
      draft.newParas.some(text => text.trim().length > 0)
    );
  }, [diary, draft]);

  const handleConflict = useCallback(
    async (error: unknown) => {
      if (isConflict(error)) {
        messageApi.warning('版本冲突：已加载服务端最新内容，本次修改未生效，他人段落不受影响');
        await refresh(true);
      } else {
        messageApi.error(errorMessage(error));
      }
    },
    [messageApi, refresh]
  );

  const saveDraft = async () => {
    if (!diary || !draft) return;
    const paragraphs: ParagraphInput[] = [];
    for (const paragraph of diary.paragraphs) {
      if (draft.deletes.includes(paragraph.id)) continue;
      const edited = draft.edits[paragraph.id];
      if (edited !== undefined && edited.trim() !== paragraph.content) {
        paragraphs.push({ existingId: paragraph.id, content: edited.trim() });
      }
    }
    for (const text of draft.newParas) {
      if (text.trim()) paragraphs.push({ content: text.trim() });
    }
    setSaving(true);
    try {
      const next = await diaryApi.saveDraft(tripId, {
        version: diary.version,
        title: draft.title.trim(),
        paragraphs,
        deleteParagraphIds: draft.deletes
      });
      applyDiary(next);
      messageApi.success(`草稿已保存，新版本 v${next.version}`);
    } catch (error) {
      await handleConflict(error);
    } finally {
      setSaving(false);
    }
  };

  const moveParagraph = async (id: number, delta: -1 | 1) => {
    if (!diary) return;
    const ordered = [...diary.paragraphs].sort((a, b) => a.seq - b.seq);
    const index = ordered.findIndex(item => item.id === id);
    const swap = index + delta;
    if (index < 0 || swap < 0 || swap >= ordered.length) return;
    const target = ordered[swap];
    // 不能跨越他人段落（他人相对顺序不变，也不能把自己的段落插到他人之间改变他人相对顺序——
    // 仅允许与相邻的本人段落交换）
    if (target.authorId !== currentUser.id) {
      messageApi.warning('只能与相邻的本人段落交换位置，他人段落顺序保持不变');
      return;
    }
    [ordered[index], ordered[swap]] = [ordered[swap], ordered[index]];
    try {
      const next = await diaryApi.reorder(tripId, diary.version, ordered.map(item => item.id));
      applyDiary(next);
    } catch (error) {
      await handleConflict(error);
    }
  };

  const publish = () => {
    if (!diary) return;
    if (dirty) {
      messageApi.warning('还有未保存的草稿，请先保存再发布');
      return;
    }
    modalApi.confirm({
      title: '确认发布旅行日记？',
      content: '发布后标题、段落顺序和作者昵称将被冻结，不能再修改，且只能发布一次。',
      okText: '发布',
      cancelText: '取消',
      onOk: async () => {
        setPublishing(true);
        try {
          const next = await diaryApi.publish(tripId);
          applyDiary(next);
          messageApi.success('旅行日记已发布');
        } catch (error) {
          messageApi.error(errorMessage(error));
        } finally {
          setPublishing(false);
        }
      }
    });
  };

  const finishTrip = async () => {
    try {
      const next = await tripApi.finish(tripId);
      setTrip(next);
      messageApi.success('行程已结束，发起人可以发布日记');
      await refresh(true);
    } catch (error) {
      messageApi.error(errorMessage(error));
    }
  };

  const joinOrLeave = async (action: 'join' | 'leave') => {
    try {
      if (action === 'join') await tripApi.join(tripId);
      else await tripApi.leave(tripId);
      messageApi.success(action === 'join' ? '已加入行程' : '已离队，历史段落保留但不可再改');
      await refresh(true);
    } catch (error) {
      messageApi.error(errorMessage(error));
    }
  };

  const myMembership = members.find(item => item.userId === currentUser.id);
  const published = diary?.status === DiaryStatus.Published;

  return (
    <Row gutter={16}>
      <Col xs={24} md={17}>
        <Card
          title={
            <Space>
              <EditOutlined />
              旅行日记
              {published ? <Tag color="success" icon={<CheckCircleFilled />}>已发布</Tag> : <Tag color="processing">草稿</Tag>}
              {diary && <Tag>v{diary.version}</Tag>}
            </Space>
          }
          extra={
            <Space>
              <SelectTrip tripId={tripId} onChange={setTripId} />
              <Button icon={<ReloadOutlined />} onClick={() => refresh()}>刷新</Button>
              <span>{currentUser.nickname}</span>
              <Button size="small" icon={<LogoutOutlined />} onClick={onLogout}>退出</Button>
            </Space>
          }
        >
          {loading ? (
            <div style={{ textAlign: 'center', padding: 48 }}><Spin tip="加载日记中" /></div>
          ) : !diary || !draft ? (
            <Empty description="无法加载日记" />
          ) : (
            <>
              <DiaryNotice diary={diary} trip={trip} currentUserId={currentUser.id} onFinish={finishTrip} />
              <DiaryTitle draft={draft} diary={diary} onChange={title => setDraft({ ...draft, title })} />
              <ParagraphList
                diary={diary}
                draft={draft}
                currentUserId={currentUser.id}
                onEdit={(id, content) => setDraft({ ...draft, edits: { ...draft.edits, [id]: content } })}
                onDelete={id => setDraft({ ...draft, deletes: [...draft.deletes.filter(x => x !== id), id] })}
                onRestore={id => setDraft({ ...draft, deletes: draft.deletes.filter(x => x !== id) })}
                onMove={moveParagraph}
              />
              {diary.permissions.canEdit && (
                <NewParagraph draft={draft} onChange={newParas => setDraft({ ...draft, newParas })} />
              )}
              {diary.permissions.canEdit && (
                <Space style={{ marginTop: 16 }}>
                  <Button type="primary" loading={saving} disabled={!dirty} onClick={saveDraft}>
                    保存草稿（提交版本 v{diary.version}）
                  </Button>
                  {dirty && <Typography.Text type="secondary">有未保存修改</Typography.Text>}
                </Space>
              )}
              {diary.permissions.canPublish && (
                <Button
                  type="primary"
                  danger
                  style={{ marginLeft: 12 }}
                  loading={publishing}
                  disabled={dirty}
                  onClick={publish}
                >
                  发布旅行日记
                </Button>
              )}
            </>
          )}
        </Card>
      </Col>
      <Col xs={24} md={7}>
        <Card title={<><TeamOutlined /> 行程成员</>} style={{ marginBottom: 16 }}>
          <List
            size="small"
            dataSource={members}
            renderItem={member => (
              <List.Item
                actions={[
                  member.status === 'LEFT' ? <Tag key="s" color="default">已离队</Tag> : <Tag key="s" color="green">在队</Tag>,
                  member.userId === trip?.ownerId ? <Tag key="o" color="gold">发起人</Tag> : null
                ]}
              >
                {member.joinedNickname}（#{member.userId}）
              </List.Item>
            )}
          />
          {myMembership && (
            <Space style={{ marginTop: 12 }}>
              {myMembership.status === 'ACTIVE' && trip?.ownerId !== currentUser.id && (
                <Button danger icon={<UserDeleteOutlined />} onClick={() => joinOrLeave('leave')}>离队</Button>
              )}
              {myMembership.status === 'LEFT' && (
                <Button icon={<UserAddOutlined />} onClick={() => joinOrLeave('join')}>重新加入</Button>
              )}
            </Space>
          )}
          {!myMembership && (
            <Button type="primary" icon={<UserAddOutlined />} style={{ marginTop: 12 }} onClick={() => joinOrLeave('join')}>
              加入行程
            </Button>
          )}
        </Card>
        <Card size="small" title="规则说明">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>只能编辑本人创建的段落，保存需提交上次版本号。</li>
            <li>版本过期整次修改被拒绝，服务端内容与他人段落不动。</li>
            <li>行程结束前仅能存草稿，结束后发起人才能发布。</li>
            <li>发布后标题、段落顺序、作者昵称全部冻结，重复发布只生效一次。</li>
            <li>离队成员的段落仍可查看但不可再改。</li>
          </ul>
        </Card>
      </Col>
    </Row>
  );
}

function SelectTrip({ tripId, onChange }: { tripId: number; onChange: (id: number) => void }) {
  return (
    <Space>
      <span>行程：</span>
      <Button type={tripId === 1 ? 'primary' : 'default'} size="small" onClick={() => onChange(1)}>#1 大理（已结束）</Button>
      <Button type={tripId === 2 ? 'primary' : 'default'} size="small" onClick={() => onChange(2)}>#2 青海湖（未结束）</Button>
    </Space>
  );
}

function DiaryNotice({ diary, trip, currentUserId, onFinish }: { diary: Diary; trip: TripInfo | null; currentUserId: number; onFinish: () => void }) {
  if (diary.status === DiaryStatus.Published) {
    return (
      <Alert
        style={{ marginBottom: 16 }}
        type="success"
        showIcon
        message="该日记已发布并冻结"
        description={`标题、段落顺序与作者昵称均为发布时快照（${diary.publishedAt ? new Date(diary.publishedAt).toLocaleString() : ''}）。重复发布只生效一次。`}
      />
    );
  }
  if (!diary.permissions.finished) {
    return (
      <Alert
        style={{ marginBottom: 16 }}
        type="info"
        showIcon
        message="行程尚未结束，只能保存草稿"
        description={
          trip?.ownerId === currentUserId
            ? '发起人可在行程实际结束后，或点击下方按钮手动结束行程，随后才能发布。'
            : '等行程结束且发起人发布后，内容将被冻结。'
        }
        action={
          trip?.ownerId === currentUserId ? (
            <Button size="small" danger onClick={onFinish}>结束行程</Button>
          ) : undefined
        }
      />
    );
  }
  if (!diary.permissions.active) {
    return <Alert style={{ marginBottom: 16 }} type="warning" showIcon message="你已离队，段落仍可查看但不能再改" />;
  }
  if (diary.permissions.isOwner) {
    return <Alert style={{ marginBottom: 16 }} type="info" showIcon message="行程已结束，保存草稿后即可发布" />;
  }
  return <Alert style={{ marginBottom: 16 }} type="info" showIcon message="行程已结束，仍可继续补充草稿，等待发起人发布" />;
}

function DiaryTitle({ draft, diary, onChange }: { draft: DraftState; diary: Diary; onChange: (title: string) => void }) {
  const editable = diary.permissions.canEdit;
  return (
    <Typography.Title level={2} style={{ marginTop: 0 }}>
      {editable ? (
        <Input value={draft.title} maxLength={160} onChange={event => onChange(event.target.value)} style={{ maxWidth: 480, fontWeight: 700 }} />
      ) : (
        draft.title
      )}
    </Typography.Title>
  );
}

function ParagraphList({
  diary,
  draft,
  currentUserId,
  onEdit,
  onDelete,
  onRestore,
  onMove
}: {
  diary: Diary;
  draft: DraftState;
  currentUserId: number;
  onEdit: (id: number, content: string) => void;
  onDelete: (id: number) => void;
  onRestore: (id: number) => void;
  onMove: (id: number, delta: -1 | 1) => void;
}) {
  const ordered = [...diary.paragraphs].sort((a, b) => a.seq - b.seq);
  if (ordered.length === 0 && draft.newParas.every(text => !text.trim())) {
    return <Empty description="还没有段落，写下第一段吧" style={{ margin: '24px 0' }} />;
  }
  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      {ordered.map((paragraph, index) => {
        const deleted = draft.deletes.includes(paragraph.id);
        const mine = paragraph.authorId === currentUserId;
        const editable = diary.permissions.canEdit && mine;
        const value = draft.edits[paragraph.id] ?? paragraph.content;
        return (
          <Card
            key={paragraph.id}
            size="small"
            style={deleted ? { opacity: 0.5, borderStyle: 'dashed' } : undefined}
            title={
              <Space>
                <Tag color={mine ? 'blue' : 'default'}>{paragraph.authorNickname}{mine ? '（我）' : ''}</Tag>
                {deleted && <Tag color="red">待删除</Tag>}
              </Space>
            }
            extra={
              diary.permissions.canEdit && mine && !deleted ? (
                <Space>
                  <Button size="small" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => onMove(paragraph.id, -1)} />
                  <Button size="small" icon={<ArrowDownOutlined />} disabled={index === ordered.length - 1} onClick={() => onMove(paragraph.id, 1)} />
                  <Button size="small" danger onClick={() => onDelete(paragraph.id)}>删除</Button>
                </Space>
              ) : null
            }
          >
            {deleted ? (
              <Typography.Text delete>{paragraph.content}</Typography.Text>
            ) : editable ? (
              <Input.TextArea rows={3} maxLength={5000} showCount value={value} onChange={event => onEdit(paragraph.id, event.target.value)} />
            ) : (
              <Typography.Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{paragraph.content}</Typography.Paragraph>
            )}
            {deleted && diary.permissions.canEdit && mine && (
              <Button size="small" type="link" onClick={() => onRestore(paragraph.id)}>撤销删除</Button>
            )}
          </Card>
        );
      })}
    </Space>
  );
}

function NewParagraph({ draft, onChange }: { draft: DraftState; onChange: (paras: string[]) => void }) {
  return (
    <Space direction="vertical" style={{ width: '100%', marginTop: 16 }} size={8}>
      {draft.newParas.map((text, index) => (
        <Card key={index} size="small" title={<Tag color="blue">新段落（我）</Tag>}
          extra={<Button size="small" danger onClick={() => onChange(draft.newParas.filter((_, i) => i !== index))}>移除</Button>}>
          <Input.TextArea
            rows={3}
            maxLength={5000}
            showCount
            value={text}
            placeholder="写下这一段…"
            onChange={event => onChange(draft.newParas.map((item, i) => (i === index ? event.target.value : item)))}
          />
        </Card>
      ))}
      <Button icon={<PlusOutlined />} block onClick={() => onChange([...draft.newParas, ''])}>
        添加我的段落
      </Button>
    </Space>
  );
}
