import { Button, Card, DatePicker, Form, Input, InputNumber, Select } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { tripApi } from '../api';

interface Props {
  onCreated: () => void;
  notify: (type: 'success' | 'error', text: string) => void;
}

export default function PublishTripForm({ onCreated, notify }: Props) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const values = await form.validateFields();
    setLoading(true);
    try {
      await tripApi.create({
        destination: values.destination,
        departDate: values.departDate.format('YYYY-MM-DD'),
        days: values.days,
        budgetMin: values.budgetMin,
        budgetMax: values.budgetMax,
        transport: values.transport,
        companionCount: values.companionCount ?? 1,
        genderPreference: values.genderPreference
      });
      notify('success', '行程已发布');
      form.resetFields();
      onCreated();
    } catch (err: any) {
      notify('error', err?.message ?? '发布失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <Form
        form={form}
        layout="vertical"
        className="form"
        initialValues={{ transport: '公共交通', companionCount: 1, departDate: dayjs('2026-07-12') }}
      >
        <Form.Item label="目的地" name="destination" rules={[{ required: true, message: '请输入目的地' }]}>
          <Input placeholder="例如：大理" />
        </Form.Item>
        <Form.Item label="出发时间" name="departDate" rules={[{ required: true, message: '请选择出发时间' }]}>
          <DatePicker />
        </Form.Item>
        <Form.Item label="行程天数" name="days" rules={[{ required: true, message: '请输入天数' }]}>
          <InputNumber min={1} max={365} addonAfter="天" />
        </Form.Item>
        <Form.Item label="预算下限" name="budgetMin"><InputNumber min={0} addonAfter="元" /></Form.Item>
        <Form.Item label="预算上限" name="budgetMax"><InputNumber min={0} addonAfter="元" /></Form.Item>
        <Form.Item label="出行方式" name="transport" rules={[{ required: true }]}>
          <Select options={['自驾', '公共交通', '徒步'].map(v => ({ value: v, label: v }))} />
        </Form.Item>
        <Form.Item label="期望旅伴人数" name="companionCount">
          <InputNumber min={1} max={20} />
        </Form.Item>
        <Form.Item label="性别偏好" name="genderPreference">
          <Select allowClear placeholder="不限" options={[
            { value: '不限', label: '不限' },
            { value: '男', label: '男' },
            { value: '女', label: '女' }
          ]} />
        </Form.Item>
        <Button type="primary" loading={loading} onClick={submit}>发布计划</Button>
      </Form>
    </Card>
  );
}
