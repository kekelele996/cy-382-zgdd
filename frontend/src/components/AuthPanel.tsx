import { Button, Card, Form, Input, Space, Tag } from 'antd';
import { useState } from 'react';
import { authApi, setSession } from '../api';
import type { AuthUser } from '../types';

interface Props {
  user: AuthUser | null;
  onLogin: (user: AuthUser) => void;
  onLogout: () => void;
  notify: (type: 'success' | 'error', text: string) => void;
}

export default function AuthPanel({ user, onLogin, onLogout, notify }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const submit = async () => {
    const values = await form.validateFields();
    setLoading(true);
    try {
      if (mode === 'login') {
        const result = await authApi.login(values.email, values.password);
        setSession(result.token, result.user);
        onLogin(result.user);
        notify('success', `欢迎回来，${result.user.nickname}`);
      } else {
        await authApi.register(values.email, values.nickname, values.password);
        const result = await authApi.login(values.email, values.password);
        setSession(result.token, result.user);
        onLogin(result.user);
        notify('success', `注册成功，已登录为 ${result.user.nickname}`);
      }
    } catch (err: any) {
      notify('error', err?.message ?? '操作失败');
    } finally {
      setLoading(false);
    }
  };

  if (user) {
    return (
      <Card size="small">
        <Space>
          <span>当前用户</span>
          <Tag color="blue">{user.nickname}（#{user.id}）</Tag>
          <Button size="small" onClick={onLogout}>退出登录</Button>
        </Space>
      </Card>
    );
  }

  return (
    <Card size="small" title={mode === 'login' ? '登录后共写日记' : '注册新账号'}>
      <Form form={form} layout="inline" onFinish={submit}>
        <Form.Item name="email" rules={[{ required: true, message: '请输入邮箱' }]}>
          <Input placeholder="邮箱" />
        </Form.Item>
        {mode === 'register' && (
          <Form.Item name="nickname" rules={[{ required: true, message: '请输入昵称' }]}>
            <Input placeholder="昵称（发布时冻结）" />
          </Form.Item>
        )}
        <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
          <Input.Password placeholder="密码" />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={loading}>{mode === 'login' ? '登录' : '注册并登录'}</Button>
            <Button type="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
}
