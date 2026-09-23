import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  List,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
  Typography
} from 'antd';
import { LockOutlined, ReloadOutlined } from '@ant-design/icons';
import { ApiError, diaryApi, tripApi } from '../api';
import type { AuthUser, DiaryView, MemberView, Trip } from '../types';

interface Props {
  user: AuthUser | null;
  notify: (type: 'success' | 'error', text: string) => void;
}

const TRIP_STATUS_TEXT: Record<string, string> = { OPEN: '招募中', MATCHED: '已成行', FINISHED: '已结束' };

export default function DiaryPage({ user, notify }: Props) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(true);
  const [tripId, setTripId] = useState<number | null>(null);
  const [diary, setDiary] = useState<DiaryView | null>(null);
  const [members, setMembers] = useState<MemberView[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // 本地草稿编辑区
  const [titleDraft, setTitleDraft] = useState('');
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [pending, setPending] = useState<string[]>([]);

  const loadTrips = useCallback(async () => {
    setTripsLoading(true);
    try {
      setTrips(await tripApi.list());
    } catch (err: any) {
      notify('error', err?.message ?? '行程加载失败');
    } finally {
      setTripsLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  const applyDiary = useCallback((data: DiaryView) => {
    setDiary(data);
    setTitleDraft(data.title);
    setEdits({});
    setPending([]);
  }, []);

  const loadDiary = useCallback(async (id: number, silent = false) => {
    if (!silent) setLoading(true);
    try {
      applyDiary(await diaryApi.view(id));
      const memberResult = await tripApi.members(id);
      setMembers(memberResult.members);
    } catch (err: any) {
      notify('error', err?.message ?? '日记加载失败');
      setDiary(null);
    } finally {
      setLoading(false);
    }
  }, [applyDiary, notify]);

  useEffect(() => {
    if (tripId != null && user) {
      loadDiary(tripId);
    } else {
      setDiary(null);
      setMembers([]);
    }
  }, [tripId, user, loadDiary]);

  const currentTrip = trips.find(t => t.id === tripId) ?? null;
  const myMember = members.find(m => m.userId === user?.id) ?? null;
  const iAmOwner = !!currentTrip && !!user && currentTrip.ownerId === user.id;
  const iAmActiveMember = iAmOwner || myMember?.status === 'ACTIVE';

  const dirty =
    !!diary && !diary.frozen && diary.canEdit && (
      titleDraft.trim() !== diary.title ||
      Object.entries(edits).some(([id, value]) => {
        const original = diary.paragraphs.find(p => p.id === Number(id));
        return original && value !== original.content;
      }) ||
      pending.some(text => text.trim().length > 0)
    );

  const refreshAfterConflict = (message: string) => {
    Modal.confirm({
      title: '版本冲突',
      content: `${message}。刷新会丢弃你本地未保存的修改，并加载所有人的最新内容与发布状态。`,
      okText: '刷新日记',
      cancelText: '留在本页',
      onOk: () => tripId && loadDiary(tripId)
    });
  };

  const saveDraft = async () => {
    if (!diary) return;
    const paragraphs: Array<{ id?: number; content: string }> = [];
    for (const p of diary.paragraphs) {
      if (p.editable && edits[p.id] !== undefined && edits[p.id] !== p.content) {
        paragraphs.push({ id: p.id, content: edits[p.id] });
      }
    }
    for (const text of pending) {
      if (text.trim()) paragraphs.push({ content: text.trim() });
    }
    setSaving(true);
    try {
      const next = await diaryApi.saveDraft(diary.tripId, {
        version: diary.version,
        ...(titleDraft.trim() !== diary.title ? { title: titleDraft.trim() } : {}),
        ...(paragraphs.length ? { paragraphs } : {})
      });
      applyDiary(next);
      notify('success', `草稿已保存，当前版本 v${next.version}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        refreshAfterConflict(err.message);
      } else if (err instanceof ApiError && err.code === 'DIARY_PUBLISHED') {
        notify('error', err.message);
        if (tripId) loadDiary(tripId);
      } else {
        notify('error', err instanceof Error ? err.message : '保存失败');
      }
    } finally {
      setSaving(false);
    }
  };

  const publish = () => {
    if (!diary) return;
    Modal.confirm({
      title: '发布旅行日记？',
      content: '发布后标题、段落顺序和每位作者的昵称都会冻结，任何人都不能再修改。此操作只生效一次。',
      okText: '确认发布',
      okButtonProps: { danger: true },
      cancelText: '再想想',
      onOk: async () => {
        setPublishing(true);
        try {
          const next = await diaryApi.publish(diary.tripId);
          applyDiary(next);
          notify('success', '日记已发布');
        } catch (err) {
          if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
            refreshAfterConflict(err.message);
          } else {
            notify('error', err instanceof Error ? err.message : '发布失败');
          }
        } finally {
          setPublishing(false);
        }
      }
    });
  };

  const joinTrip = async () => {
    if (!tripId) return;
    try {
      await tripApi.join(tripId);
      notify('success', '已加入行程');
      await loadTrips();
      await loadDiary(tripId);
    } catch (err: any) {
      notify('error', err?.message ?? '加入失败');
    }
  };

  const leaveTrip = () => {
    if (!tripId) return;
    Modal.confirm({
      title: '确认离开该行程？',
      content: '离队后你已写的段落仍可被大家查看，但会永久冻结，你也不能再编辑日记。',
      okText: '确认离队',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await tripApi.leave(tripId);
          notify('success', '已离队，你的段落已冻结');
          await loadDiary(tripId);
        } catch (err: any) {
          notify('error', err?.message ?? '离队失败');
        }
      }
    });
  };

  const finishTrip = async () => {
    if (!tripId) return;
    try {
      await tripApi.finish(tripId);
      notify('success', '行程已结束，发起人现在可以发布日记');
      await loadTrips();
      await loadDiary(tripId);
    } catch (err: any) {
      notify('error', err?.message ?? '结束行程失败');
    }
  };

  if (!user) {
    return <Empty description="请先在上方登录或注册，再进入旅行日记" />;
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card size="small">
        <Space wrap>
          <span>选择行程：</span>
          <Select
            style={{ minWidth: 320 }}
            placeholder={tripsLoading ? '加载行程中…' : '选择一个行程'}
            value={tripId}
            onChange={setTripId}
            options={trips.map(t => ({
              value: t.id,
              label: `${t.destination} · ${t.departDate} · ${t.days} 天 · ${TRIP_STATUS_TEXT[t.status] ?? t.status}`
            }))}
          />
          <Button icon={<ReloadOutlined />} onClick={() => tripId && loadDiary(tripId)}>刷新</Button>
          {currentTrip && (
            <>
              <Tag color={currentTrip.status === 'FINISHED' ? 'default' : 'green'}>{TRIP_STATUS_TEXT[currentTrip.status] ?? currentTrip.status}</Tag>
              {iAmOwner && <Tag color="gold">我是发起人</Tag>}
              {!iAmOwner && myMember?.status === 'ACTIVE' && <Tag color="blue">在队成员</Tag>}
              {!iAmOwner && myMember?.status === 'LEFT' && <Tag color="red">已离队（只读）</Tag>}
            </>
          )}
        </Space>
        <div style={{ marginTop: 12 }}>
          {currentTrip && !iAmOwner && !myMember && <Button type="primary" onClick={joinTrip}>申请加入行程</Button>}
          {currentTrip && iAmActiveMember && !iAmOwner && <Button danger onClick={leaveTrip}>离开行程</Button>}
          {currentTrip && iAmOwner && currentTrip.status !== 'FINISHED' && <Button onClick={finishTrip}>结束行程（发起人）</Button>}
        </div>
      </Card>

      {!currentTrip ? (
        !tripsLoading && <Empty description="还没有行程，可先在「发布行程」页创建一个行程" />
      ) : (
        <Spin spinning={loading}>
          {diary && (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {diary.frozen && (
                <Alert
                  type="success"
                 
                  message="日记已发布，内容已冻结"
                  description={`标题、段落顺序和作者昵称均以发布时刻为准（发布于 ${diary.publishedAt ? new Date(diary.publishedAt).toLocaleString() : '-'}）。重复发布不会重复生效。`}
                />
              )}
              {!diary.frozen && !diary.canEdit && (
                <Alert type="warning" message="你只能查看这份日记" description="你已离开该行程，自己和他人的段落都不能再修改，但内容仍可完整查看。" />
              )}
              {!diary.frozen && diary.canEdit && !diary.canPublish && iAmOwner && (
                <Alert type="info" message="行程尚未结束" description="当前只能保存草稿；行程结束后发起人才能发布。" />
              )}

              <Card
                title="旅行日记"
                extra={<Space><Tag>版本 v{diary.version}</Tag><Tag color={diary.frozen ? 'success' : 'processing'}>{diary.frozen ? '已发布' : '草稿'}</Tag></Space>}
                actions={diary.frozen || !diary.canEdit ? [] : [
                  <Space key="actions" style={{ padding: '0 24px', justifyContent: 'flex-end', width: '100%' }}>
                    <Button onClick={saveDraft} loading={saving} disabled={!dirty}>保存草稿</Button>
                    <Button type="primary" danger onClick={publish} loading={publishing} disabled={!diary.canPublish}>
                      发布日记
                    </Button>
                  </Space>
                ]}
              >
                <Typography.Title level={5}>标题{diary.frozen ? '（已冻结）' : ''}</Typography.Title>
                <Input
                  value={titleDraft}
                  disabled={diary.frozen || !diary.canEdit}
                  onChange={e => setTitleDraft(e.target.value)}
                  placeholder="给共同旅行日记起个标题"
                  style={{ maxWidth: 480 }}
                />

                <Typography.Title level={5} style={{ marginTop: 20 }}>共写段落（按保存顺序排列，发布时冻结顺序）</Typography.Title>
                <List
                  bordered
                  dataSource={diary.paragraphs}
                  locale={{ emptyText: '还没有段落，写下第一段吧' }}
                  renderItem={(p, index) => (
                    <List.Item style={{ display: 'block', width: '100%' }}>
                      <Space style={{ marginBottom: 8 }}>
                        <Tag>{index + 1}</Tag>
                        <strong>{p.authorNickname}</strong>
                        {p.locked && <Tag icon={<LockOutlined />} color="default">作者已离队 · 只读</Tag>}
                        {!p.locked && p.authorId === user?.id && !diary.frozen && <Tag color="blue">我写的</Tag>}
                      </Space>
                      {p.editable ? (
                        <Input.TextArea
                          autoSize={{ minRows: 2, maxRows: 8 }}
                          value={edits[p.id] ?? p.content}
                          onChange={e => setEdits(prev => ({ ...prev, [p.id]: e.target.value }))}
                        />
                      ) : (
                        <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{p.content}</Typography.Paragraph>
                      )}
                    </List.Item>
                  )}
                />

                {!diary.frozen && diary.canEdit && (
                  <div style={{ marginTop: 16 }}>
                    <Typography.Text strong>新增我的段落：</Typography.Text>
                    {pending.map((text, idx) => (
                      <Input.TextArea
                        key={idx}
                        autoSize={{ minRows: 2, maxRows: 6 }}
                        style={{ marginTop: 8 }}
                        value={text}
                        placeholder={`我的新段落 #${idx + 1}`}
                        onChange={e => setPending(prev => prev.map((item, i) => (i === idx ? e.target.value : item)))}
                      />
                    ))}
                    <Button
                      style={{ marginTop: 8 }}
                      type="dashed"
                      block
                      onClick={() => setPending(prev => [...prev, ''])}
                    >
                      + 添加段落
                    </Button>
                  </div>
                )}
              </Card>

              <Card size="small" title={`行程成员（${members.length}）`}>
                <List
                  dataSource={members}
                  renderItem={m => (
                    <List.Item>
                      <Space>
                        <strong>{m.nickname}</strong>
                        {m.role === 'OWNER' && <Tag color="gold">发起人</Tag>}
                        {m.status === 'LEFT' && <Tag color="red">已离队</Tag>}
                        {m.status === 'ACTIVE' && m.role === 'MEMBER' && <Tag color="green">在队</Tag>}
                        {m.userId === user?.id && <Tag color="blue">我</Tag>}
                      </Space>
                    </List.Item>
                  )}
                />
              </Card>
            </Space>
          )}
        </Spin>
      )}
    </Space>
  );
}
