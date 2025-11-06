import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { bitable, IAttachmentField, IFieldMeta, FieldType } from '@lark-base-open/js-sdk';
import { Button, Select, InputNumber, Alert, Card, Space, Divider, Spin, Typography, Row, Col, Radio, Image, Checkbox } from 'antd';
import imageCompression from 'browser-image-compression';
import './style.css';

const { Title, Text } = Typography;

interface CompressedImage {
  recordId: string;
  index: number;
  originalFile: File;
  compressedFile: File;
  originalUrl: string;
  compressedUrl: string;
  originalSize: number;
  compressedSize: number;
  name: string;
  selected: boolean;
}

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
  const [compressMode, setCompressMode] = useState<'current' | 'column'>('current');
  const [compressing, setCompressing] = useState(false);
  const [compressedImages, setCompressedImages] = useState<CompressedImage[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info' | 'warning', text: string } | null>(null);
  const [applying, setApplying] = useState(false);

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
    setMessage(null);
    setCompressedImages([]);

    try {
      const table = await bitable.base.getActiveTable();
      const field = await table.getField<IAttachmentField>(selectedField);
      const compressed: CompressedImage[] = [];

      let recordIds: string[] = [];

      if (compressMode === 'current') {
        const selection = await bitable.base.getSelection();
        if (!selection?.recordId) {
          setMessage({ type: 'warning', text: '请先选中一个单元格' });
          setCompressing(false);
          return;
        }
        recordIds = [selection.recordId];
      } else {
        recordIds = await table.getRecordIdList();
      }

      for (const recordId of recordIds) {
        const cellValue = await field.getValue(recordId);

        if (cellValue && Array.isArray(cellValue) && cellValue.length > 0) {
          const urls = await field.getAttachmentUrls(recordId);
          
          for (let j = 0; j < cellValue.length; j++) {
            const attachment = cellValue[j];
            const url = urls[j];
            
            if (!url || !attachment.type || !attachment.type.startsWith('image/')) {
              continue;
            }
            
            try {
              const response = await fetch(url);
              const blob = await response.blob();
              const originalFile = new File([blob], attachment.name, { type: attachment.type });
              
              const compressedFile = await compressImage(originalFile);
              
              const originalUrl = URL.createObjectURL(originalFile);
              const compressedUrl = URL.createObjectURL(compressedFile);

              compressed.push({
                recordId,
                index: j,
                originalFile,
                compressedFile,
                originalUrl,
                compressedUrl,
                originalSize: originalFile.size,
                compressedSize: compressedFile.size,
                name: attachment.name,
                selected: true
              });
            } catch (error) {
              console.error(`压缩图片失败 (${attachment.name}):`, error);
            }
          }
        }
      }

      setCompressedImages(compressed);
      
      if (compressed.length === 0) {
        setMessage({ type: 'info', text: '未找到可压缩的图片' });
      } else {
        setMessage({ 
          type: 'success', 
          text: `已压缩 ${compressed.length} 张图片，请预览并选择要替换的图片` 
        });
      }
    } catch (error) {
      console.error('压缩失败:', error);
      setMessage({ type: 'error', text: '压缩过程中出现错误' });
    } finally {
      setCompressing(false);
    }
  };

  const handleApply = async () => {
    const selectedImages = compressedImages.filter(img => img.selected);
    
    if (selectedImages.length === 0) {
      setMessage({ type: 'warning', text: '请至少选择一张图片进行替换' });
      return;
    }

    setApplying(true);
    setMessage(null);

    try {
      const table = await bitable.base.getActiveTable();
      const field = await table.getField<IAttachmentField>(selectedField);

      const recordGroups = new Map<string, CompressedImage[]>();
      selectedImages.forEach(img => {
        if (!recordGroups.has(img.recordId)) {
          recordGroups.set(img.recordId, []);
        }
        recordGroups.get(img.recordId)!.push(img);
      });

      let successCount = 0;

      for (const [recordId, images] of recordGroups) {
        try {
          const cellValue = await field.getValue(recordId);
          if (!cellValue || !Array.isArray(cellValue)) continue;

          const urls = await field.getAttachmentUrls(recordId);
          const updatedFiles: File[] = [];

          for (let j = 0; j < cellValue.length; j++) {
            const attachment = cellValue[j];
            const compressedImage = images.find(img => img.index === j);

            if (compressedImage) {
              updatedFiles.push(compressedImage.compressedFile);
              successCount++;
            } else {
              const url = urls[j];
              if (url) {
                const response = await fetch(url);
                const blob = await response.blob();
                const file = new File([blob], attachment.name, { 
                  type: attachment.type || 'application/octet-stream' 
                });
                updatedFiles.push(file);
              }
            }
          }

          if (updatedFiles.length === cellValue.length) {
            await field.setValue(recordId, updatedFiles);
          }
        } catch (error) {
          console.error(`更新记录失败 (${recordId}):`, error);
        }
      }

      compressedImages.forEach(img => {
        URL.revokeObjectURL(img.originalUrl);
        URL.revokeObjectURL(img.compressedUrl);
      });

      setCompressedImages([]);
      setMessage({ 
        type: 'success', 
        text: `成功替换 ${successCount} 张图片` 
      });
    } catch (error) {
      console.error('应用失败:', error);
      setMessage({ type: 'error', text: '应用更改时出现错误' });
    } finally {
      setApplying(false);
    }
  };

  const toggleImageSelection = (index: number) => {
    setCompressedImages(prev => prev.map((img, i) => 
      i === index ? { ...img, selected: !img.selected } : img
    ));
  };

  const toggleAllSelection = (checked: boolean) => {
    setCompressedImages(prev => prev.map(img => ({ ...img, selected: checked })));
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
        <Text type="secondary">压缩表格中的图片附件，节省存储空间</Text>
        
        <Divider />

        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Text strong>选择附件字段：</Text>
            <Select
              style={{ width: '100%', marginTop: 8 }}
              value={selectedField}
              onChange={setSelectedField}
              disabled={compressing || applying}
            >
              {fields.map(field => (
                <Select.Option key={field.id} value={field.id}>
                  {field.name}
                </Select.Option>
              ))}
            </Select>
          </div>

          <div>
            <Text strong>压缩模式：</Text>
            <Radio.Group 
              value={compressMode} 
              onChange={(e) => setCompressMode(e.target.value)}
              style={{ marginTop: 8, width: '100%' }}
              disabled={compressing || applying}
            >
              <Space direction="vertical">
                <Radio value="current">压缩当前单元格</Radio>
                <Radio value="column">压缩整列</Radio>
              </Space>
            </Radio.Group>
          </div>

          <div>
            <Text strong>压缩设置：</Text>
            <Row gutter={16} style={{ marginTop: 8 }}>
              <Col span={12}>
                <Text>质量 (0.1-1.0):</Text>
                <InputNumber
                  style={{ width: '100%', marginTop: 4 }}
                  min={0.1}
                  max={1}
                  step={0.1}
                  value={quality}
                  onChange={(value) => setQuality(value || 0.8)}
                  disabled={compressing || applying}
                />
              </Col>
            </Row>
          </div>

          {message && (
            <Alert message={message.text} type={message.type} showIcon closable onClose={() => setMessage(null)} />
          )}

          {compressedImages.length === 0 && (
            <Button
              type="primary"
              size="large"
              onClick={handleCompress}
              loading={compressing}
              disabled={compressing || applying}
              block
            >
              {compressing ? '正在压缩...' : '开始压缩'}
            </Button>
          )}

          {compressedImages.length > 0 && (
            <>
              <div>
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text strong>压缩结果预览（{compressedImages.filter(img => img.selected).length}/{compressedImages.length} 张已选择）</Text>
                  <Checkbox 
                    checked={compressedImages.every(img => img.selected)}
                    onChange={(e) => toggleAllSelection(e.target.checked)}
                  >
                    全选
                  </Checkbox>
                </div>
                
                <div style={{ maxHeight: 500, overflow: 'auto' }}>
                  {compressedImages.map((img, index) => (
                    <Card 
                      key={index} 
                      size="small" 
                      style={{ marginBottom: 16 }}
                      title={
                        <Checkbox 
                          checked={img.selected}
                          onChange={() => toggleImageSelection(index)}
                        >
                          {img.name}
                        </Checkbox>
                      }
                    >
                      <Row gutter={16}>
                        <Col span={12}>
                          <div style={{ textAlign: 'center' }}>
                            <Text strong>原图</Text>
                            <div style={{ marginTop: 8 }}>
                              <Image src={img.originalUrl} width={200} />
                            </div>
                            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                              {formatBytes(img.originalSize)}
                            </Text>
                          </div>
                        </Col>
                        <Col span={12}>
                          <div style={{ textAlign: 'center' }}>
                            <Text strong>压缩后</Text>
                            <div style={{ marginTop: 8 }}>
                              <Image src={img.compressedUrl} width={200} />
                            </div>
                            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                              {formatBytes(img.compressedSize)}
                            </Text>
                            <Text type="success" style={{ display: 'block', marginTop: 4 }}>
                              节省 {formatBytes(img.originalSize - img.compressedSize)} 
                              ({Math.round((1 - img.compressedSize / img.originalSize) * 100)}%)
                            </Text>
                          </div>
                        </Col>
                      </Row>
                    </Card>
                  ))}
                </div>
              </div>

              <Row gutter={16}>
                <Col span={12}>
                  <Button
                    size="large"
                    onClick={() => {
                      compressedImages.forEach(img => {
                        URL.revokeObjectURL(img.originalUrl);
                        URL.revokeObjectURL(img.compressedUrl);
                      });
                      setCompressedImages([]);
                    }}
                    disabled={applying}
                    block
                  >
                    取消
                  </Button>
                </Col>
                <Col span={12}>
                  <Button
                    type="primary"
                    size="large"
                    onClick={handleApply}
                    loading={applying}
                    disabled={applying || compressedImages.filter(img => img.selected).length === 0}
                    block
                  >
                    {applying ? '正在应用...' : '应用选中的图片'}
                  </Button>
                </Col>
              </Row>
            </>
          )}

          <Alert
            message="使用说明"
            description={
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li>选择包含图片的附件字段</li>
                <li>选择压缩模式：
                  <ul>
                    <li><strong>当前单元格</strong>：只压缩当前选中单元格中的图片</li>
                    <li><strong>整列</strong>：压缩该字段所有单元格中的图片</li>
                  </ul>
                </li>
                <li>设置压缩质量（0.1-1.0，越小文件越小但质量越低）</li>
                <li>点击"开始压缩"预览压缩效果</li>
                <li>查看压缩前后对比，勾选要替换的图片</li>
                <li>点击"应用选中的图片"完成替换</li>
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