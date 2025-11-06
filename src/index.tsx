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
  const [maxWidth, setMaxWidth] = useState<number | null>(null);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info' | 'warning', text: string } | null>(null);
  const [stats, setStats] = useState<{ total: number, compressed: number, failed: number, skipped: number, originalSize: number, compressedSize: number }>({
    total: 0,
    compressed: 0,
    failed: 0,
    skipped: 0,
    originalSize: 0,
    compressedSize: 0
  });
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [skippedRecords, setSkippedRecords] = useState<number>(0);

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
    return new Promise(async (resolve, reject) => {
      try {
        const needResize = maxWidth || maxHeight;
        
        if (!needResize) {
          const options = {
            maxSizeMB: 10,
            useWebWorker: true,
            initialQuality: quality
          };
          
          try {
            const compressedFile = await imageCompression(file, options);
            resolve(compressedFile);
          } catch (error) {
            reject(error);
          }
          return;
        }
        
        const img = new Image();
        const reader = new FileReader();
        
        reader.onload = (e) => {
          img.onload = async () => {
            let { width, height } = img;
            let shouldResize = false;
            
            if (maxWidth && width > maxWidth) {
              shouldResize = true;
            }
            if (maxHeight && height > maxHeight) {
              shouldResize = true;
            }
            
            if (shouldResize) {
              const widthRatio = maxWidth ? maxWidth / width : Infinity;
              const heightRatio = maxHeight ? maxHeight / height : Infinity;
              const ratio = Math.min(widthRatio, heightRatio);
              width = Math.round(width * ratio);
              height = Math.round(height * ratio);
            }
            
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            
            if (!ctx) {
              reject(new Error('无法创建 canvas context'));
              return;
            }
            
            ctx.drawImage(img, 0, 0, width, height);
            
            canvas.toBlob(
              async (blob) => {
                if (!blob) {
                  reject(new Error('无法创建 blob'));
                  return;
                }
                
                const resizedFile = new File([blob], file.name, { type: file.type });
                
                const options = {
                  maxSizeMB: 10,
                  useWebWorker: true,
                  initialQuality: quality
                };
                
                try {
                  const compressedFile = await imageCompression(resizedFile, options);
                  resolve(compressedFile);
                } catch (error) {
                  reject(error);
                }
              },
              file.type,
              quality
            );
          };
          
          img.onerror = () => reject(new Error('图片加载失败'));
          img.src = e.target?.result as string;
        };
        
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsDataURL(file);
      } catch (error) {
        reject(error);
      }
    });
  };

  const handleCompress = async () => {
    if (!selectedField) {
      setMessage({ type: 'warning', text: '请先选择一个附件字段' });
      return;
    }

    setCompressing(true);
    setProgress(0);
    setMessage(null);
    setStats({ total: 0, compressed: 0, failed: 0, skipped: 0, originalSize: 0, compressedSize: 0 });
    setFailedImages([]);
    setSkippedRecords(0);

    try {
      const table = await bitable.base.getActiveTable();
      const recordIdList = await table.getRecordIdList();
      const field = await table.getField<IAttachmentField>(selectedField);

      let totalImages = 0;
      let compressedImages = 0;
      let failedCount = 0;
      let skippedRecordCount = 0;
      let totalOriginalSize = 0;
      let totalCompressedSize = 0;
      const failed: string[] = [];

      for (let i = 0; i < recordIdList.length; i++) {
        const recordId = recordIdList[i];
        const cellValue = await field.getValue(recordId);

        if (cellValue && Array.isArray(cellValue) && cellValue.length > 0) {
          const urls = await field.getAttachmentUrls(recordId);
          const updatedFiles: File[] = [];
          let hasChanges = false;
          let hasError = false;
          
          for (let j = 0; j < cellValue.length; j++) {
            const attachment = cellValue[j];
            const url = urls[j];
            
            if (!url) {
              hasError = true;
              break;
            }
            
            try {
              const response = await fetch(url);
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
              }
              const blob = await response.blob();
              
              if (attachment.type && attachment.type.startsWith('image/')) {
                totalImages++;
                
                try {
                  const originalFile = new File([blob], attachment.name, { type: attachment.type });
                  totalOriginalSize += originalFile.size;

                  const compressedFile = await compressImage(originalFile);
                  totalCompressedSize += compressedFile.size;

                  updatedFiles.push(compressedFile);
                  hasChanges = true;
                  compressedImages++;
                  
                  setStats({
                    total: totalImages,
                    compressed: compressedImages,
                    failed: failedCount,
                    skipped: skippedRecordCount,
                    originalSize: totalOriginalSize,
                    compressedSize: totalCompressedSize
                  });
                } catch (error) {
                  console.error(`压缩图片失败 (${attachment.name}):`, error);
                  const originalFile = new File([blob], attachment.name, { type: attachment.type });
                  updatedFiles.push(originalFile);
                  failedCount++;
                  failed.push(attachment.name);
                  setStats({
                    total: totalImages,
                    compressed: compressedImages,
                    failed: failedCount,
                    skipped: skippedRecordCount,
                    originalSize: totalOriginalSize,
                    compressedSize: totalCompressedSize
                  });
                }
              } else {
                const file = new File([blob], attachment.name, { type: attachment.type || 'application/octet-stream' });
                updatedFiles.push(file);
              }
            } catch (error) {
              console.error(`下载附件失败 (${attachment.name}):`, error);
              hasError = true;
              break;
            }
          }
          
          if (hasError) {
            skippedRecordCount++;
            setSkippedRecords(skippedRecordCount);
            console.warn(`跳过记录 ${recordId}：部分附件下载失败`);
          } else if (hasChanges && updatedFiles.length > 0) {
            if (updatedFiles.length !== cellValue.length) {
              console.warn(`跳过记录 ${recordId}：附件数量不匹配`);
              skippedRecordCount++;
              setSkippedRecords(skippedRecordCount);
            } else {
              try {
                await field.setValue(recordId, updatedFiles);
              } catch (error) {
                console.error(`更新记录失败 (${recordId}):`, error);
                skippedRecordCount++;
                setSkippedRecords(skippedRecordCount);
              }
            }
          }
        }

        setProgress(Math.round(((i + 1) / recordIdList.length) * 100));
      }
      
      setFailedImages(failed);

      if (totalImages === 0) {
        setMessage({ type: 'info', text: '未找到任何图片' });
      } else if (failedCount > 0 || skippedRecordCount > 0) {
        let msg = `压缩完成！成功: ${compressedImages} 张`;
        if (failedCount > 0) msg += `，失败: ${failedCount} 张`;
        if (skippedRecordCount > 0) msg += `，跳过记录: ${skippedRecordCount} 条`;
        msg += `。原始大小: ${formatBytes(totalOriginalSize)}, 压缩后: ${formatBytes(totalCompressedSize)}, 节省: ${formatBytes(totalOriginalSize - totalCompressedSize)}`;
        setMessage({ type: 'warning', text: msg });
      } else {
        setMessage({ 
          type: 'success', 
          text: `成功压缩 ${compressedImages} 张图片！原始大小: ${formatBytes(totalOriginalSize)}, 压缩后: ${formatBytes(totalCompressedSize)}, 节省: ${formatBytes(totalOriginalSize - totalCompressedSize)}` 
        });
      }
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
                  onChange={(value) => setMaxWidth(value || null)}
                  placeholder="不限制"
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
                  onChange={(value) => setMaxHeight(value || null)}
                  placeholder="不限制"
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
                  <Text>已压缩: {stats.compressed} / {stats.total} 张图片</Text>
                  {stats.failed > 0 && (
                    <>
                      <br />
                      <Text type="danger">失败: {stats.failed} 张</Text>
                    </>
                  )}
                  {stats.skipped > 0 && (
                    <>
                      <br />
                      <Text type="warning">跳过记录: {stats.skipped} 条</Text>
                    </>
                  )}
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

          {failedImages.length > 0 && (
            <Alert
              message={`以下 ${failedImages.length} 张图片压缩失败`}
              description={
                <div style={{ maxHeight: 150, overflow: 'auto' }}>
                  {failedImages.map((name, index) => (
                    <div key={index}>• {name}</div>
                  ))}
                </div>
              }
              type="error"
              showIcon
              closable
              onClose={() => setFailedImages([])}
            />
          )}

          {skippedRecords > 0 && (
            <Alert
              message={`跳过了 ${skippedRecords} 条记录`}
              description="这些记录因附件下载失败或更新失败而被跳过，以确保数据完整性。您可以稍后重试这些记录。"
              type="warning"
              showIcon
              closable
              onClose={() => setSkippedRecords(0)}
            />
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
                <li>可选：设置最大宽度和高度（超过的图片会按比例缩放，留空则不限制尺寸）</li>
                <li>点击"开始批量压缩"处理所有记录中的图片</li>
                <li>压缩后的图片会替换原图片</li>
                <li>注意：如果某条记录的附件下载失败，该记录会被跳过以保证数据完整性</li>
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