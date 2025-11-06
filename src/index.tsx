import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { bitable, IAttachmentField, IFieldMeta, FieldType } from '@lark-base-open/js-sdk';
import { Button, Select, InputNumber, Progress, Alert, Card, Space, Divider, Spin, Typography, Row, Col } from 'antd';
import imageCompression from 'browser-image-compression';
import './style.css';

const { Title, Text } = Typography;

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <LoadApp />
  </React.StrictMode>
)

function LoadApp() {
  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState<IFieldMeta[]>([]);
  const [selectedField, setSelectedField] = useState<string>('');
  const [quality, setQuality] = useState<number>(0.8);
  const [maxWidth, setMaxWidth] = useState<number>(1920);
  const [maxHeight, setMaxHeight] = useState<number>(1920);
  const [compressing, setCompressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info' | 'warning', text: string } | null>(null);
  const [stats, setStats] = useState<{ total: number, compressed: number, originalSize: number, compressedSize: number }>({
    total: 0,
    compressed: 0,
    originalSize: 0,
    compressedSize: 0
  });

  useEffect(() => {
    loadAttachmentFields();
  }, []);

  const loadAttachmentFields = async () => {
    try {
      const table = await bitable.base.getActiveTable();
      const fieldMetaList = await table.getFieldMetaList();
      const attachmentFields = fieldMetaList.filter(field => field.type === FieldType.Attachment);
      
      setFields(attachmentFields);
      if (attachmentFields.length > 0) {
        setSelectedField(attachmentFields[0].id);
      }
      setLoading(false);
    } catch (error) {
      console.error('加载字段失败:', error);
      setMessage({ type: 'error', text: '加载附件字段失败' });
      setLoading(false);
    }
  };

  const compressImage = async (file: File): Promise<File> => {
    const options = {
      maxSizeMB: 10,
      maxWidthOrHeight: Math.max(maxWidth, maxHeight),
      useWebWorker: true,
      initialQuality: quality
    };
    
    try {
      const compressedFile = await imageCompression(file, options);
      return compressedFile;
    } catch (error) {
      console.error('压缩图片失败:', error);
      throw error;
    }
  };

  const handleCompress = async () => {
    if (!selectedField) {
      setMessage({ type: 'warning', text: '请先选择一个附件字段' });
      return;
    }

    setCompressing(true);
    setProgress(0);
    setMessage(null);
    setStats({ total: 0, compressed: 0, originalSize: 0, compressedSize: 0 });

    try {
      const table = await bitable.base.getActiveTable();
      const recordIdList = await table.getRecordIdList();
      const field = await table.getField<IAttachmentField>(selectedField);

      let totalImages = 0;
      let compressedImages = 0;
      let totalOriginalSize = 0;
      let totalCompressedSize = 0;

      for (let i = 0; i < recordIdList.length; i++) {
        const recordId = recordIdList[i];
        const cellValue = await field.getValue(recordId);

        if (cellValue && Array.isArray(cellValue) && cellValue.length > 0) {
          const urls = await field.getAttachmentUrls(recordId);
          
          for (let j = 0; j < cellValue.length; j++) {
            const attachment = cellValue[j];
            if (attachment.type && attachment.type.startsWith('image/')) {
              totalImages++;
              
              try {
                const url = urls[j];
                if (!url) continue;
                
                const response = await fetch(url);
                const blob = await response.blob();
                const originalFile = new File([blob], attachment.name, { type: attachment.type });
                
                totalOriginalSize += originalFile.size;

                const compressedFile = await compressImage(originalFile);
                totalCompressedSize += compressedFile.size;

                const fileList = await bitable.base.batchUploadFile([compressedFile]);
                
                if (fileList && fileList.length > 0) {
                  const newAttachments = cellValue.map(att => 
                    att.token === attachment.token ? fileList[0] : att
                  );
                  
                  await field.setValue(recordId, newAttachments as any);
                  compressedImages++;
                  
                  setStats({
                    total: totalImages,
                    compressed: compressedImages,
                    originalSize: totalOriginalSize,
                    compressedSize: totalCompressedSize
                  });
                }
              } catch (error) {
                console.error(`压缩图片失败 (${attachment.name}):`, error);
              }
            }
          }
        }

        setProgress(Math.round(((i + 1) / recordIdList.length) * 100));
      }

      setMessage({ 
        type: 'success', 
        text: `成功压缩 ${compressedImages} 张图片！原始大小: ${formatBytes(totalOriginalSize)}, 压缩后: ${formatBytes(totalCompressedSize)}, 节省: ${formatBytes(totalOriginalSize - totalCompressedSize)}` 
      });
    } catch (error) {
      console.error('批量压缩失败:', error);
      setMessage({ type: 'error', text: '批量压缩过程中出现错误' });
    } finally {
      setCompressing(false);
      setProgress(0);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="container">
        <Spin size="large" tip="正在加载..." />
      </div>
    );
  }

  if (fields.length === 0) {
    return (
      <div className="container">
        <Alert message="未找到附件字段" description="当前表格中没有附件类型的字段，请先添加附件字段。" type="warning" showIcon />
      </div>
    );
  }

  return (
    <div className="container">
      <Card>
        <Title level={3}>📸 图片压缩工具</Title>
        <Text type="secondary">批量压缩表格中的图片附件，节省存储空间</Text>
        
        <Divider />

        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Text strong>选择附件字段：</Text>
            <Select
              style={{ width: '100%', marginTop: 8 }}
              value={selectedField}
              onChange={setSelectedField}
              disabled={compressing}
            >
              {fields.map(field => (
                <Select.Option key={field.id} value={field.id}>
                  {field.name}
                </Select.Option>
              ))}
            </Select>
          </div>

          <div>
            <Text strong>压缩设置：</Text>
            <Row gutter={16} style={{ marginTop: 8 }}>
              <Col span={8}>
                <Text>质量 (0.1-1.0):</Text>
                <InputNumber
                  style={{ width: '100%', marginTop: 4 }}
                  min={0.1}
                  max={1}
                  step={0.1}
                  value={quality}
                  onChange={(value) => setQuality(value || 0.8)}
                  disabled={compressing}
                />
              </Col>
              <Col span={8}>
                <Text>最大宽度 (px):</Text>
                <InputNumber
                  style={{ width: '100%', marginTop: 4 }}
                  min={100}
                  max={4096}
                  step={100}
                  value={maxWidth}
                  onChange={(value) => setMaxWidth(value || 1920)}
                  disabled={compressing}
                />
              </Col>
              <Col span={8}>
                <Text>最大高度 (px):</Text>
                <InputNumber
                  style={{ width: '100%', marginTop: 4 }}
                  min={100}
                  max={4096}
                  step={100}
                  value={maxHeight}
                  onChange={(value) => setMaxHeight(value || 1920)}
                  disabled={compressing}
                />
              </Col>
            </Row>
          </div>

          {compressing && (
            <div>
              <Text strong>压缩进度：</Text>
              <Progress percent={progress} status="active" style={{ marginTop: 8 }} />
              {stats.total > 0 && (
                <div style={{ marginTop: 8 }}>
                  <Text>已处理: {stats.compressed} / {stats.total} 张图片</Text>
                  <br />
                  <Text>原始大小: {formatBytes(stats.originalSize)}</Text>
                  <br />
                  <Text>压缩后: {formatBytes(stats.compressedSize)}</Text>
                  <br />
                  <Text type="success">
                    节省空间: {formatBytes(stats.originalSize - stats.compressedSize)} 
                    ({stats.originalSize > 0 ? Math.round((1 - stats.compressedSize / stats.originalSize) * 100) : 0}%)
                  </Text>
                </div>
              )}
            </div>
          )}

          {message && (
            <Alert message={message.text} type={message.type} showIcon closable onClose={() => setMessage(null)} />
          )}

          <Button
            type="primary"
            size="large"
            onClick={handleCompress}
            loading={compressing}
            disabled={compressing}
            block
          >
            {compressing ? '正在压缩...' : '开始批量压缩'}
          </Button>

          <Alert
            message="使用说明"
            description={
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li>选择包含图片的附件字段</li>
                <li>设置压缩质量（0.1-1.0，越小文件越小但质量越低）</li>
                <li>设置最大宽度和高度（超过的图片会按比例缩放）</li>
                <li>点击"开始批量压缩"处理所有记录中的图片</li>
                <li>压缩后的图片会替换原图片</li>
              </ul>
            }
            type="info"
            showIcon
          />
        </Space>
      </Card>
    </div>
  );
}