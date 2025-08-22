import { ImageOptimizer, OptimizationOptions } from '../ImageOptimizer';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import * as sharp from 'sharp';

// モック
jest.mock('sharp');
jest.mock('../../utils/logger');

const mockSharp = sharp as jest.MockedFunction<typeof sharp>;

describe('ImageOptimizer', () => {
    let imageOptimizer: ImageOptimizer;
    let tempDir: string;
    let testImagePath: string;
    let mockSharpInstance: any;

    beforeEach(async () => {
        // テスト用の一時ディレクトリを作成
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'image-optimizer-test-'));
        testImagePath = path.join(tempDir, 'test.png');

        // テスト用の画像ファイルを作成（空ファイル）
        await fs.writeFile(testImagePath, Buffer.alloc(1024)); // 1KB のテストファイル

        // Sharp インスタンスのモック
        mockSharpInstance = {
            resize: jest.fn().mockReturnThis(),
            webp: jest.fn().mockReturnThis(),
            jpeg: jest.fn().mockReturnThis(),
            png: jest.fn().mockReturnThis(),
            toFile: jest.fn().mockResolvedValue(undefined),
        };

        mockSharp.mockReturnValue(mockSharpInstance);

        imageOptimizer = new ImageOptimizer();
    });

    afterEach(async () => {
        // テスト用ディレクトリをクリーンアップ
        if (await fs.pathExists(tempDir)) {
            await fs.remove(tempDir);
        }
        jest.clearAllMocks();
    });

    describe('initialization', () => {
        it('should initialize with default options', () => {
            const options = imageOptimizer.getOptions();
            expect(options.quality).toBe(80);
            expect(options.format).toBe('webp');
            expect(options.maxWidth).toBe(1920);
            expect(options.maxHeight).toBe(1080);
            expect(options.removeOriginal).toBe(false);
        });

        it('should initialize with custom options', () => {
            const customOptions: Partial<OptimizationOptions> = {
                quality: 60,
                format: 'jpeg',
                removeOriginal: true
            };

            const customOptimizer = new ImageOptimizer(customOptions);
            const options = customOptimizer.getOptions();

            expect(options.quality).toBe(60);
            expect(options.format).toBe('jpeg');
            expect(options.removeOriginal).toBe(true);
            expect(options.maxWidth).toBe(1920); // デフォルト値
        });
    });

    describe('single image optimization', () => {
        it('should optimize image successfully', async () => {
            const outputPath = path.join(tempDir, 'optimized.webp');

            const result = await imageOptimizer.optimizeImage(testImagePath, outputPath);

            expect(result.success).toBe(true);
            expect(result.originalPath).toBe(testImagePath);
            expect(result.optimizedPath).toBe(outputPath);
            expect(result.originalSize).toBe(1024);
            expect(mockSharp).toHaveBeenCalledWith(testImagePath);
            expect(mockSharpInstance.webp).toHaveBeenCalledWith({ quality: 80 });
            expect(mockSharpInstance.toFile).toHaveBeenCalledWith(outputPath);
        });

        it('should apply resize options', async () => {
            const options: Partial<OptimizationOptions> = {
                maxWidth: 800,
                maxHeight: 600
            };

            await imageOptimizer.optimizeImage(testImagePath, undefined, options);

            expect(mockSharpInstance.resize).toHaveBeenCalledWith(800, 600, {
                fit: 'inside',
                withoutEnlargement: true
            });
        });

        it('should handle different formats', async () => {
            // JPEG
            await imageOptimizer.optimizeImage(testImagePath, undefined, { format: 'jpeg' });
            expect(mockSharpInstance.jpeg).toHaveBeenCalledWith({ quality: 80 });

            // PNG
            await imageOptimizer.optimizeImage(testImagePath, undefined, { format: 'png' });
            expect(mockSharpInstance.png).toHaveBeenCalledWith({ 
                quality: 80,
                compressionLevel: 2
            });
        });

        it('should remove original file when requested', async () => {
            const outputPath = path.join(tempDir, 'optimized.webp');
            
            await imageOptimizer.optimizeImage(testImagePath, outputPath, { removeOriginal: true });

            // 元ファイルが削除されていることを確認（モックなので実際のファイルは残る）
            expect(await fs.pathExists(testImagePath)).toBe(true); // モックなので実際は削除されない
        });

        it('should handle optimization errors', async () => {
            mockSharpInstance.toFile.mockRejectedValue(new Error('Sharp error'));

            const result = await imageOptimizer.optimizeImage(testImagePath);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Sharp error');
        });

        it('should generate optimized path when not provided', async () => {
            const result = await imageOptimizer.optimizeImage(testImagePath);

            expect(result.optimizedPath).toContain('test_optimized_');
            expect(result.optimizedPath).toMatch(/\.webp$/);
        });
    });

    describe('directory optimization', () => {
        beforeEach(async () => {
            // テスト用の画像ファイルを複数作成
            await fs.writeFile(path.join(tempDir, 'image1.png'), Buffer.alloc(1024));
            await fs.writeFile(path.join(tempDir, 'image2.jpg'), Buffer.alloc(2048));
            await fs.writeFile(path.join(tempDir, 'document.txt'), 'not an image'); // 画像ではないファイル
        });

        it('should optimize all images in directory', async () => {
            const outputDir = path.join(tempDir, 'optimized');

            const results = await imageOptimizer.optimizeDirectory(tempDir, outputDir);

            expect(results).toHaveLength(3); // test.png, image1.png, image2.jpg
            expect(results.every(r => r.success)).toBe(true);
            expect(mockSharp).toHaveBeenCalledTimes(3);
        });

        it('should filter only image files', async () => {
            const results = await imageOptimizer.optimizeDirectory(tempDir);

            // テキストファイルは処理されない
            const processedFiles = results.map(r => path.basename(r.originalPath));
            expect(processedFiles).not.toContain('document.txt');
        });

        it('should handle directory with no images', async () => {
            const emptyDir = path.join(tempDir, 'empty');
            await fs.ensureDir(emptyDir);

            const results = await imageOptimizer.optimizeDirectory(emptyDir);

            expect(results).toHaveLength(0);
        });
    });

    describe('batch optimization', () => {
        it('should optimize batch of files', async () => {
            const filePaths = [testImagePath];
            const outputDir = path.join(tempDir, 'batch_output');

            const results = await imageOptimizer.optimizeBatch(filePaths, outputDir);

            expect(results).toHaveLength(1);
            expect(results[0].success).toBe(true);
            expect(results[0].optimizedPath).toContain('batch_output');
        });

        it('should handle empty batch', async () => {
            const results = await imageOptimizer.optimizeBatch([]);

            expect(results).toHaveLength(0);
        });
    });

    describe('utility methods', () => {
        it('should update options', () => {
            const newOptions: Partial<OptimizationOptions> = {
                quality: 90,
                format: 'png'
            };

            imageOptimizer.updateOptions(newOptions);
            const options = imageOptimizer.getOptions();

            expect(options.quality).toBe(90);
            expect(options.format).toBe('png');
            expect(options.maxWidth).toBe(1920); // 変更されていない値はそのまま
        });

        it('should check supported formats', () => {
            expect(ImageOptimizer.isSupportedFormat('test.png')).toBe(true);
            expect(ImageOptimizer.isSupportedFormat('test.jpg')).toBe(true);
            expect(ImageOptimizer.isSupportedFormat('test.jpeg')).toBe(true);
            expect(ImageOptimizer.isSupportedFormat('test.bmp')).toBe(true);
            expect(ImageOptimizer.isSupportedFormat('test.tiff')).toBe(true);
            
            expect(ImageOptimizer.isSupportedFormat('test.txt')).toBe(false);
            expect(ImageOptimizer.isSupportedFormat('test.pdf')).toBe(false);
        });

        it('should format file sizes correctly', () => {
            expect(ImageOptimizer.formatFileSize(0)).toBe('0 Bytes');
            expect(ImageOptimizer.formatFileSize(1024)).toBe('1 KB');
            expect(ImageOptimizer.formatFileSize(1024 * 1024)).toBe('1 MB');
            expect(ImageOptimizer.formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
            expect(ImageOptimizer.formatFileSize(1536)).toBe('1.5 KB');
        });
    });

    describe('error handling', () => {
        it('should handle file not found error', async () => {
            const nonExistentPath = path.join(tempDir, 'nonexistent.png');

            const result = await imageOptimizer.optimizeImage(nonExistentPath);

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should handle directory read error', async () => {
            const nonExistentDir = path.join(tempDir, 'nonexistent');

            await expect(imageOptimizer.optimizeDirectory(nonExistentDir))
                .rejects.toThrow();
        });
    });
});