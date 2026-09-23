import { Card, Col, Layout, List, Row, Statistic, Tabs } from 'antd';
import { EnvironmentOutlined, MessageOutlined } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import AuthPanel from './components/AuthPanel';
import DiaryPage from './components/DiaryPage';
import PublishTripForm from './components/PublishTripForm';
import { clearSession, getCurrentUser } from './api';
import type { AuthUser } from './types';

const trips = [
  { destination: '大理', departDate: '2026-07-12', days: 5, budget: '3500-5200', transport: '公共交通', score: 96 },
  { destination: '青海湖', departDate: '2026-08-03', days: 7, budget: '4800-6800', transport: '自驾', score: 88 }
];

export default function App({ notify }: { notify: (type: 'success' | 'error', text: string) => void }) {
  const [user, setUser] = useState<AuthUser | null>(() => getCurrentUser());
  const [messages, setMessages] = useState(['系统：已进入大理行程协作空间']);
  const [publishVersion, setPublishVersion] = useState(0);
  const socket = useMemo(() => io('/', { path: '/socket.io' }), []);

  const send = () => {
    socket.emit('trip-message', { tripId: 1, sender: '我', content: '今晚确认民宿地址', type: 'text' });
    setMessages(items => [...items, '我：今晚确认民宿地址']);
  };

  return (
    <Layout className="shell">
      <Layout.Sider width={240} className="side">
        <h1>旅伴匹配</h1>
        <p>TripMatch</p>
      </Layout.Sider>
      <Layout.Content className="content">
        <div style={{ marginBottom: 16 }}>
          <AuthPanel
            user={user}
            onLogin={setUser}
            onLogout={() => {
              clearSession();
              setUser(null);
            }}
            notify={notify}
          />
        </div>
        <Tabs
          items={[
            {
              key: 'publish',
              label: '发布行程',
              children: <PublishTripForm key={publishVersion} onCreated={() => setPublishVersion(v => v + 1)} notify={notify} />
            },
            {
              key: 'match',
              label: '智能匹配',
              children: (
                <Row gutter={16}>
                  {trips.map(trip => (
                    <Col span={12} key={trip.destination}>
                      <Card title={<><EnvironmentOutlined /> {trip.destination}</>}>
                        <p>{trip.departDate} / {trip.days} 天 / {trip.transport}</p>
                        <Statistic title="匹配度" value={trip.score} suffix="%" />
                      </Card>
                    </Col>
                  ))}
                </Row>
              )
            },
            {
              key: 'board',
              label: '协作看板',
              children: (
                <Card title="每日安排">
                  <List
                    dataSource={['Day 1 抵达与集合', 'Day 2 环洱海', 'Day 3 沙溪古镇']}
                    renderItem={item => <List.Item>{item}</List.Item>}
                  />
                </Card>
              )
            },
            {
              key: 'chat',
              label: '即时沟通',
              children: (
                <Card title={<><MessageOutlined /> 行程群聊</>}>
                  <List dataSource={messages} renderItem={item => <List.Item>{item}</List.Item>} />
                  <button onClick={send}>发送示例消息</button>
                </Card>
              )
            },
            {
              key: 'diary',
              label: '旅行日记',
              children: <DiaryPage key={`${user?.id ?? 'anon'}-${publishVersion}`} user={user} notify={notify} />
            }
          ]}
        />
      </Layout.Content>
    </Layout>
  );
}
