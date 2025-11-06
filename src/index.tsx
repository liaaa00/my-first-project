import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
// 导入多维表格 SDK
import { bitable, IAttachmentField, IFieldMeta, FieldType } from '@lark-base-open/js-sdk';
// 导入 Ant Design 组件
import { Button, Select, Alert, Card, Space, Divider, Spin, Typography, Row, Col, Radio, Image, Checkbox, Slider } from 'antd';
// 导入图片压缩库
import imageCompression from 'browser-image-compression';
import './style.css'; // 假设您有这个样式文件

const { Title, Text } = Typography;

// 定义压缩图片的数据结构
interface CompressedImage {
    recordId: string;
    index: number; // 附件在单元格数组中的索引
    originalFile: File;
    compressedFile: File;
    originalUrl: string;
    compressedUrl: string;
    originalSize: number;
    compressedSize: number;
    name: string;
    selected: boolean;
}

// 根渲染
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <LoadApp />
    </React.StrictMode>
);

function LoadApp() {
    const [loading, setLoading] = useState(true);
    const [fields, setFields] = useState<IFieldMeta[]>([]);
    const [selectedField, setSelectedField] = useState<string>('');
    const [maxSizeMB, setMaxSizeMB] = useState<number>(2);
    const [compressMode, setCompressMode] = useState<'current' | 'column'>('current');
    const [compressing, setCompressing] = useState(false);
    const [compressedImages, setCompressedImages] = useState<CompressedImage[]>([]);
    const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info' | 'warning', text: string } | null>(null);
    const [applying, setApplying] = useState(false);

    // 页面加载时，加载附件字段列表
    useEffect(() => {
        loadAttachmentFields();
    }, []);

    // 格式化字节大小
    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    };

    // 获取当前表格中的附件字段
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

    // 调用 browser-image-compression 进行图片压缩
    const compressImage = async (file: File): Promise<File> => {
        const options = {
            maxSizeMB: maxSizeMB,
            useWebWorker: true,
            alwaysKeepResolution: false
        };

        try {
            const compressedBlob = await imageCompression(file, options);

            // 关键修复：将Blob转换为File对象
            const compressedFile = new File(
                [compressedBlob],
                file.name,
                {
                    type: compressedBlob.type || file.type,
                    lastModified: Date.now()
                }
            );

            console.log('压缩完成:', {
                原始大小: file.size,
                压缩后大小: compressedFile.size,
                类型: compressedFile.constructor.name,
                isFile: compressedFile instanceof File
            });

            return compressedFile;
        } catch (error) {
            console.error('压缩图片失败:', error);
            throw error;
        }
    };

    // 第一步：压缩图片并展示预览结果
    const handleCompress = async () => {
        if (!selectedField) {
            setMessage({ type: 'warning', text: '请先选择一个附件字段' });
            return;
        }

        setCompressing(true);
        setMessage(null);
        // 清理上一次的 URL 资源
        compressedImages.forEach(img => {
            URL.revokeObjectURL(img.originalUrl);
            URL.revokeObjectURL(img.compressedUrl);
        });
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
                    // 获取图片 URL 是下载的前提
                    const urls = await field.getAttachmentUrls(recordId);

                    for (let j = 0; j < cellValue.length; j++) {
                        const attachment = cellValue[j];
                        const url = urls[j];

                        // 仅处理图片类型且有 URL 的附件
                        if (!url || !attachment.type || !attachment.type.startsWith('image/')) {
                            continue;
                        }

                        try {
                            // 1. 下载原始图片
                            const response = await fetch(url);
                            const blob = await response.blob();
                            // 将 Blob 转换为 File 对象，方便压缩库处理
                            const originalFile = new File([blob], attachment.name, { type: attachment.type });

                            // 2. 压缩
                            const compressedFile = await compressImage(originalFile);

                            // 3. 准备预览数据
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
                                selected: true // 默认选中
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

    // 第二步：应用选中的图片（使用Cell API替代Field API）
    const handleApply = async () => {
        // 1. 过滤出选中且有效的图片
        const selectedImages = compressedImages.filter(img =>
            img && img.selected && img.recordId && img.compressedFile
        );

        if (selectedImages.length === 0) {
            setMessage({ type: 'warning', text: '请至少选择一张图片进行替换' });
            return;
        }

        setApplying(true);
        setMessage(null);

        try {
            const table = await bitable.base.getActiveTable();
            const field = await table.getField<IAttachmentField>(selectedField);

            if (!table || !field) {
                throw new Error('无法访问表格或附件字段');
            }

            // 2. 按记录ID分组待替换的图片
            const recordGroups = new Map<string, CompressedImage[]>();
            selectedImages.forEach(img => {
                if (!recordGroups.has(img.recordId)) {
                    recordGroups.set(img.recordId, []);
                }
                recordGroups.get(img.recordId)!.push(img);
            });

            let successCount = 0;
            let failCount = 0;

            // 3. 遍历每个记录，执行替换操作
            for (const [recordId, imagesToReplace] of recordGroups) {
                try {
                    // a. 获取单元格当前的附件列表和URL
                    const originalAttachments = await field.getValue(recordId);
                    const existingAttachments: any[] = Array.isArray(originalAttachments) ? originalAttachments : [];

                    if (existingAttachments.length === 0) {
                        console.warn(`记录 ${recordId} 没有附件，跳过`);
                        failCount++;
                        continue;
                    }

                    // b. 获取所有附件的URL（在任何操作之前）
                    const urls = await field.getAttachmentUrls(recordId);

                    // c. 创建索引映射
                    const replaceMap = new Map<number, File>();
                    imagesToReplace.forEach(img => {
                        replaceMap.set(img.index, img.compressedFile);
                    });

                    // d. 构建最终的附件列表（纯File数组）
                    const finalAttachments: File[] = [];

                    for (let i = 0; i < existingAttachments.length; i++) {
                        const attachment = existingAttachments[i];

                        if (replaceMap.has(i)) {
                            // 使用压缩后的图片
                            finalAttachments.push(replaceMap.get(i)!);
                        } else if (attachment && urls[i]) {
                            // 下载原附件并转换为File对象
                            try {
                                const url = urls[i];
                                const response = await fetch(url);
                                const blob = await response.blob();
                                // 确保创建真正的File对象
                                const file = new File(
                                    [blob],
                                    attachment.name,
                                    {
                                        type: attachment.type || blob.type || 'application/octet-stream',
                                        lastModified: attachment.timeStamp || Date.now()
                                    }
                                );
                                finalAttachments.push(file);
                            } catch (error) {
                                console.error(`下载附件 ${attachment.name} 失败:`, error);
                                // 如果下载失败，记录错误但继续处理
                            }
                        }
                    }

                    // 调试信息
                    console.log(`记录 ${recordId}:`, {
                        原始附件数: existingAttachments.length,
                        最终附件数: finalAttachments.length,
                        附件详情: finalAttachments.map(f => ({
                            name: f.name,
                            type: f.type,
                            size: f.size,
                            isFile: f instanceof File,
                            isBlob: f instanceof Blob,
                            constructor: f.constructor.name
                        }))
                    });

                    // e. 验证所有File对象都是有效的（放宽验证条件）
                    const validAttachments = finalAttachments.filter(f => {
                        const isValid = (f instanceof File || (f as any) instanceof Blob) && f.size > 0;
                        if (!isValid) {
                            console.warn(`无效附件:`, {
                                name: f?.name,
                                size: f?.size,
                                isFile: f instanceof File,
                                isBlob: (f as any) instanceof Blob,
                                type: typeof f
                            });
                        }
                        return isValid;
                    });

                    console.log(`有效附件数: ${validAttachments.length}/${finalAttachments.length}`);

                    if (validAttachments.length === 0) {
                        console.warn(`记录 ${recordId} 没有有效的附件`);
                        failCount++;
                        continue;
                    }

                    if (validAttachments.length !== finalAttachments.length) {
                        console.warn(`记录 ${recordId} 有 ${finalAttachments.length - validAttachments.length} 个无效附件被过滤`);
                    }

                    // f. 尝试多种方式上传附件
                    let uploaded = false;

                    // 方式1: 尝试使用FileList（创建一个DataTransfer对象）
                    if (!uploaded) {
                        try {
                            console.log(`尝试方式1: DataTransfer/FileList...`);
                            const dataTransfer = new DataTransfer();
                            validAttachments.forEach(file => dataTransfer.items.add(file));
                            const fileList = dataTransfer.files;

                            await field.setValue(recordId, fileList);
                            console.log(`FileList方式成功`);
                            successCount++;
                            uploaded = true;
                        } catch (error) {
                            console.error(`FileList方式失败:`, error);
                        }
                    }

                    // 方式2: 尝试单个File（如果只有一个附件）
                    if (!uploaded && validAttachments.length === 1) {
                        try {
                            console.log(`尝试方式2: 单个File对象...`);
                            await field.setValue(recordId, validAttachments[0]);
                            console.log(`单个File成功`);
                            successCount++;
                            uploaded = true;
                        } catch (error) {
                            console.error(`单个File方式失败:`, error);
                        }
                    }

                    // 方式3: 尝试File数组（使用Cell API）
                    if (!uploaded) {
                        try {
                            console.log(`尝试方式3: Cell API + File数组...`);
                            const cell = await field.getCell(recordId);
                            await cell.setValue(validAttachments);
                            console.log(`Cell API成功`);
                            successCount++;
                            uploaded = true;
                        } catch (error) {
                            console.error(`Cell API方式失败:`, error);
                        }
                    }

                    // 方式4: 尝试File数组（使用Field API）
                    if (!uploaded) {
                        try {
                            console.log(`尝试方式4: Field API + File数组...`);
                            await field.setValue(recordId, validAttachments);
                            console.log(`Field API成功`);
                            successCount++;
                            uploaded = true;
                        } catch (error) {
                            console.error(`Field API方式失败:`, error);
                        }
                    }

                    // 如果所有方式都失败
                    if (!uploaded) {
                        console.error(`所有上传方式都失败了`);
                        failCount++;
                    }

                } catch (error) {
                    console.error(`替换记录 ${recordId} 的图片时出错:`, error);
                    failCount++;
                }
            }

            // 4. 显示结果并清理资源
            const totalAttempts = recordGroups.size;
            if (successCount > 0) {
                setMessage({
                    type: 'success',
                    text: `成功替换 ${successCount}/${totalAttempts} 条记录中的图片${failCount > 0 ? `，失败 ${failCount} 条` : ''}`
                });
            } else {
                setMessage({
                    type: 'error',
                    text: '图片替换失败，请查看控制台了解详细错误'
                });
            }

        } catch (error) {
            console.error('应用图片替换时发生错误:', error);
            setMessage({
                type: 'error',
                text: `操作失败: ${error instanceof Error ? error.message : String(error)}`
            });
        } finally {
            setApplying(false);
            // 清理预览资源
            compressedImages.forEach(img => {
                if (img?.originalUrl) URL.revokeObjectURL(img.originalUrl);
                if (img?.compressedUrl) URL.revokeObjectURL(img.compressedUrl);
            });
            setCompressedImages([]);
        }
    };
    // 切换单张图片选择状态
    const toggleImageSelection = (index: number) => {
        setCompressedImages(prev => prev.map((img, i) =>
            i === index ? { ...img, selected: !img.selected } : img
        ));
    };

    // 切换所有图片选择状态
    const toggleAllSelection = (checked: boolean) => {
        setCompressedImages(prev => prev.map(img => ({ ...img, selected: checked })));
    };

    // 渲染加载中或无附件字段的提示
    if (loading) {
        return (
            <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
                <Spin size="large">
                    <div style={{ padding: 50 }}>正在加载...</div>
                </Spin>
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

    // 主 UI 渲染
    return (
        <div className="container">
            <Card>
                <Title level={3}>📸 图片压缩工具</Title>
                <Text type="secondary">压缩表格中的图片附件，节省存储空间</Text>

                <Divider />

                <Space direction="vertical" size="large" style={{ width: '100%' }}>
                    {/* 字段选择 */}
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

                    {/* 压缩模式选择 */}
                    <div>
                        <Text strong>压缩模式：</Text>
                        <Radio.Group
                            value={compressMode}
                            onChange={(e) => setCompressMode(e.target.value)}
                            style={{ marginTop: 8, width: '100%' }}
                            disabled={compressing || applying}
                        >
                            <Space direction="vertical">
                                <Radio value="current">压缩当前选中单元格</Radio>
                                <Radio value="column">压缩整列</Radio>
                            </Space>
                        </Radio.Group>
                    </div>

                    {/* 压缩设置 */}
                    <div>
                        <Text strong>压缩设置：</Text>
                        <div style={{ marginTop: 16, paddingLeft: 8, paddingRight: 8 }}>
                            <Text>目标大小：{maxSizeMB} MB</Text>
                            <Slider
                                min={1}
                                max={10}
                                value={maxSizeMB}
                                onChange={setMaxSizeMB}
                                marks={{
                                    1: '1',
                                    2: '2',
                                    3: '3',
                                    4: '4',
                                    5: '5',
                                    6: '6',
                                    7: '7',
                                    8: '8',
                                    9: '9',
                                    10: '10'
                                }}
                                step={1}
                                disabled={compressing || applying}
                                tooltip={{ formatter: (value) => `${value} MB` }}
                                style={{ marginTop: 8 }}
                            />
                        </div>
                    </div>

                    {/* 消息提示 */}
                    {message && (
                        <Alert message={message.text} type={message.type} showIcon closable onClose={() => setMessage(null)} />
                    )}

                    {/* 开始压缩按钮 */}
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

                    {/* 压缩预览和应用区域 */}
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
                                                            <Image src={img.originalUrl} width={150} preview={false} />
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
                                                            <Image src={img.compressedUrl} width={150} preview={false} />
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
                                            // 清理资源并重置状态
                                            compressedImages.forEach(img => {
                                                URL.revokeObjectURL(img.originalUrl);
                                                URL.revokeObjectURL(img.compressedUrl);
                                            });
                                            setCompressedImages([]);
                                            setMessage(null);
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

                    {/* 使用说明 */}
                    <Alert
                        message="使用说明"
                        description={
                            <ul style={{ margin: 0, paddingLeft: 20 }}>
                                <li>选择包含图片的附件字段</li>
                                <li>选择目标文件大小（1-7MB）和压缩模式</li>
                                <li>点击"开始压缩"预览压缩效果</li>
                                <li>勾选要替换的图片后，点击"应用选中的图片"完成替换</li>
                                <li>**重要：** 替换操作是永久性的，请谨慎操作。</li>
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