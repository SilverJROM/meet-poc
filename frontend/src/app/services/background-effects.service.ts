import { Injectable, NgZone, inject, signal } from '@angular/core';
import type { Results, SelfieSegmentation } from '@mediapipe/selfie_segmentation';

export type BackgroundEffectMode = 'none' | 'blur' | 'image';

type SelfieSegmentationModule = typeof import('@mediapipe/selfie_segmentation');

const TARGET_FPS = 30;
const TARGET_FRAME_MS = 1000 / TARGET_FPS;
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;
const BLUR_RADIUS_PX = 18;

@Injectable({ providedIn: 'root' })
export class BackgroundEffectsService {
  private readonly zone = inject(NgZone);

  readonly mode = signal<BackgroundEffectMode>('none');
  readonly modelReady = signal(false);
  readonly lastError = signal<string | null>(null);

  private model: SelfieSegmentation | null = null;
  private modelLoad: Promise<void> | null = null;
  private inputStream: MediaStream | null = null;
  private outputStream: MediaStream | null = null;
  private outputCanvas: HTMLCanvasElement | null = null;
  private outputContext: CanvasRenderingContext2D | null = null;
  private sourceVideo: HTMLVideoElement | null = null;
  private frameRequest: number | null = null;
  private processingFrame = false;
  private lastFrameAt = 0;
  private backgroundImage: HTMLImageElement | null = null;

  async setMode(next: BackgroundEffectMode): Promise<void> {
    if (next === 'none') {
      this.mode.set('none');
      this.stopProcessing();
      return;
    }

    try {
      await this.ensureModel();
      this.lastError.set(null);
      this.mode.set(next);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load background effects.';
      this.lastError.set(message);
      this.mode.set('none');
      this.modelReady.set(false);
      console.warn('[background-effects] MediaPipe model load failed; using raw camera stream.', err);
      this.stopProcessing();
    }
  }

  async setBackgroundImage(source: HTMLImageElement | string): Promise<void> {
    if (typeof source !== 'string') {
      this.backgroundImage = source;
      return;
    }

    const image = new Image();
    image.crossOrigin = 'anonymous';
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Unable to load background image.'));
    });
    image.src = source;
    await loaded;
    this.backgroundImage = image;
  }

  processStream(input: MediaStream): MediaStream {
    if (this.mode() === 'none' || !this.modelReady() || !input.getVideoTracks().length) {
      return input;
    }
    if (this.inputStream === input && this.outputStream) {
      return this.outputStream;
    }
    if (!this.model || typeof document === 'undefined') {
      return input;
    }

    this.stopProcessing();
    const videoTrack = input.getVideoTracks()[0];
    const settings = videoTrack.getSettings();
    const width = positiveDimension(settings.width) ?? DEFAULT_WIDTH;
    const height = positiveDimension(settings.height) ?? DEFAULT_HEIGHT;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context || typeof canvas.captureStream !== 'function') {
      this.lastError.set('Canvas capture is not available in this browser.');
      return input;
    }

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.srcObject = input;

    this.inputStream = input;
    this.outputCanvas = canvas;
    this.outputContext = context;
    this.sourceVideo = video;
    this.outputStream = canvas.captureStream(TARGET_FPS);
    this.zone.runOutsideAngular(() => {
      this.model!.onResults((results) => this.drawCompositeFrame(results));
    });
    void video.play()
      .then(() => undefined)
      .catch((err) => {
        this.lastError.set(err instanceof Error ? err.message : 'Unable to start background effects preview.');
      });
    this.scheduleNextFrame();
    return this.outputStream;
  }

  dispose(): void {
    this.mode.set('none');
    this.modelReady.set(false);
    this.stopProcessing();
    if (this.model) void this.model.close();
    this.model = null;
    this.modelLoad = null;
    this.backgroundImage = null;
  }

  private async ensureModel(): Promise<void> {
    if (this.modelReady()) return;
    if (this.modelLoad) return this.modelLoad;

    this.modelLoad = (async () => {
      const imported = (await import('@mediapipe/selfie_segmentation')) as SelfieSegmentationModule & {
        default?: SelfieSegmentationModule;
      };
      const module = imported.SelfieSegmentation ? imported : imported.default ?? imported;
      const model = new module.SelfieSegmentation({
        locateFile: (file) => `assets/mediapipe/${file}`,
      });
      model.setOptions({ modelSelection: 1, selfieMode: false });
      await model.initialize();
      this.model = model;
      this.modelReady.set(true);
    })();

    try {
      await this.modelLoad;
    } finally {
      this.modelLoad = null;
    }
  }

  private scheduleNextFrame(): void {
    if (this.frameRequest !== null) return;
    this.zone.runOutsideAngular(() => {
      this.frameRequest = requestAnimationFrame((timestamp) => {
        this.frameRequest = null;
        this.processFrame(timestamp);
      });
    });
  }

  private processFrame(timestamp: number): void {
    if (this.mode() === 'none' || !this.model || !this.sourceVideo || !this.outputCanvas) return;
    if (timestamp - this.lastFrameAt < TARGET_FRAME_MS) {
      this.scheduleNextFrame();
      return;
    }
    this.lastFrameAt = timestamp;
    if (this.processingFrame) {
      this.scheduleNextFrame();
      return;
    }
    if (this.sourceVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      this.scheduleNextFrame();
      return;
    }

    this.syncCanvasSize();
    this.processingFrame = true;
    this.zone.runOutsideAngular(() => {
      this.model!
        .send({ image: this.sourceVideo! })
        .catch((err) => {
          this.lastError.set(err instanceof Error ? err.message : 'Unable to process background effect frame.');
        })
        .finally(() => {
          this.processingFrame = false;
          this.scheduleNextFrame();
        });
    });
  }

  private drawCompositeFrame(results: Results): void {
    const canvas = this.outputCanvas;
    const context = this.outputContext;
    if (!canvas || !context) {
      return;
    }
    const width = canvas.width;
    const height = canvas.height;

    context.save();
    context.clearRect(0, 0, width, height);

    // 1. Draw background first (blurred frame OR background image).
    //    Canvas filter must be applied during a source-over draw or some
    //    browsers silently drop it.
    if (this.mode() === 'image' && this.backgroundImage) {
      drawCoverImage(context, this.backgroundImage, width, height);
    } else {
      context.filter = `blur(${BLUR_RADIUS_PX}px)`;
      context.drawImage(results.image, 0, 0, width, height);
      context.filter = 'none';
    }

    // 2. Build a "person-only" canvas: original image masked by segmentation.
    //    MediaPipe's segmentationMask is grayscale with alpha=255 everywhere,
    //    so we convert red→alpha so destination-in keeps only the person area.
    const maskCanvas = this.getMaskAlphaCanvas(results.segmentationMask, width, height);
    const personCanvas = this.getPersonCanvas(results.image, maskCanvas, width, height);

    // 3. Overlay person on top of background. captureStream sees fully
    //    opaque content (bg covers everything; person sharp on top).
    if (personCanvas) {
      context.drawImage(personCanvas, 0, 0, width, height);
    }

    context.restore();
  }

  private maskWorkCanvas: HTMLCanvasElement | null = null;
  private maskWorkContext: CanvasRenderingContext2D | null = null;
  private personWorkCanvas: HTMLCanvasElement | null = null;
  private personWorkContext: CanvasRenderingContext2D | null = null;

  private getPersonCanvas(
    image: CanvasImageSource,
    maskCanvas: HTMLCanvasElement | null,
    width: number,
    height: number,
  ): HTMLCanvasElement | null {
    if (typeof document === 'undefined' || !maskCanvas) return null;
    if (!this.personWorkCanvas) {
      this.personWorkCanvas = document.createElement('canvas');
      this.personWorkContext = this.personWorkCanvas.getContext('2d');
    }
    const work = this.personWorkCanvas;
    const ctx = this.personWorkContext;
    if (!ctx) return null;
    if (work.width !== width) work.width = width;
    if (work.height !== height) work.height = height;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(maskCanvas, 0, 0, width, height);
    ctx.restore();
    return work;
  }

  private getMaskAlphaCanvas(
    mask: CanvasImageSource,
    width: number,
    height: number,
  ): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;
    if (!this.maskWorkCanvas) {
      this.maskWorkCanvas = document.createElement('canvas');
      this.maskWorkContext = this.maskWorkCanvas.getContext('2d');
    }
    const work = this.maskWorkCanvas;
    const workCtx = this.maskWorkContext;
    if (!workCtx) return null;
    if (work.width !== width) work.width = width;
    if (work.height !== height) work.height = height;
    workCtx.clearRect(0, 0, width, height);
    workCtx.drawImage(mask, 0, 0, width, height);
    const imageData = workCtx.getImageData(0, 0, width, height);
    const data = imageData.data;
    // Threshold the segmentation probability so we get a tight edge instead
    // of the halo from MediaPipe's soft mask. Values above the threshold
    // become fully opaque (person), below become fully transparent (background).
    // A narrow ramp in between (THRESHOLD_LOW..THRESHOLD_HIGH) prevents harsh
    // pixelation without re-introducing the halo.
    const THRESHOLD_LOW = 140;
    const THRESHOLD_HIGH = 180;
    const RAMP = THRESHOLD_HIGH - THRESHOLD_LOW;
    for (let i = 0; i < data.length; i += 4) {
      const m = data[i]; // luminance ~ mask probability
      let alpha: number;
      if (m <= THRESHOLD_LOW) alpha = 0;
      else if (m >= THRESHOLD_HIGH) alpha = 255;
      else alpha = Math.round(((m - THRESHOLD_LOW) / RAMP) * 255);
      data[i + 3] = alpha;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
    }
    workCtx.putImageData(imageData, 0, 0);
    return work;
  }

  private syncCanvasSize(): void {
    const video = this.sourceVideo;
    const canvas = this.outputCanvas;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return;
    if (canvas.width === video.videoWidth && canvas.height === video.videoHeight) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }

  private stopProcessing(): void {
    if (this.frameRequest !== null) {
      cancelAnimationFrame(this.frameRequest);
      this.frameRequest = null;
    }
    this.processingFrame = false;
    this.lastFrameAt = 0;
    if (this.sourceVideo) {
      this.sourceVideo.pause();
      this.sourceVideo.srcObject = null;
      this.sourceVideo = null;
    }
    this.outputStream?.getTracks().forEach((track) => track.stop());
    this.inputStream = null;
    this.outputStream = null;
    this.outputCanvas = null;
    this.outputContext = null;
  }
}

function positiveDimension(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

function drawCoverImage(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number): void {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const canvasRatio = width / height;
  const drawWidth = imageRatio > canvasRatio ? height * imageRatio : width;
  const drawHeight = imageRatio > canvasRatio ? height : width / imageRatio;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;
  context.drawImage(image, x, y, drawWidth, drawHeight);
}
