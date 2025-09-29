/**
 * @fileoverview アプリケーションのエントリーポイント（開始点）
 * @description
 * このファイルは、アプリケーション全体の動作を統括します。
 * 各モジュール（AudioCapturer, MorseAnalyzer, UIRenderer, DomController）を初期化し、
 * それらを連携させる役割を担います。
 *
 * 現在の戦略:
 * 1. `requestAnimationFrame` を使ったメインループを生成します。
 * 2. ループの各フレームで、`AudioCapturer`から最新の音声データを取得します。
 * 3. 取得したデータを`MorseAnalyzer`に渡し、口笛の周波数や音量を分析させます。
 * 4. 生の音声データと分析結果の両方を`UIRenderer`に渡し、Canvasへの描画を指示します。
 * 5. `DomController`からのUIイベント（開始/停止ボタンのクリックなど）を待ち受け、
 *    アプリケーションの状態（録音中/停止中）を管理します。
 */

import { AudioCapturer } from './audio/audio-capturer.js';
import * as DomController from './ui/dom-controller.js';
import { UIRenderer } from './ui/ui-renderer.js';
import { MorseAnalyzer } from './morse/morse-analyzer.js';

class App {
    constructor() {
        this.audioCapturer = new AudioCapturer();
        this.renderer = null;
        this.analyzer = null;
        this.animationFrameId = null;

        this.timeDomainData = null;
        this.frequencyData = null;

        DomController.initialize(this.handleStateChange.bind(this), 'visualizer');
    }

    /**
     * UIからの開始/停止要求を処理します。
     * @param {boolean} isStarting - アプリケーションを開始するかどうか。
     */
    async handleStateChange(isStarting) {
        if (isStarting) {
            try {
                await this.audioCapturer.start();
                
                const analyserNode = this.audioCapturer.getAnalyser();
                if (analyserNode) {
                    const audioContext = this.audioCapturer.getAudioContext();
                    const audioParams = {
                        sampleRate: audioContext.sampleRate,
                        fftSize: analyserNode.fftSize
                    };

                    if (!this.renderer) {
                        const canvas = document.getElementById('visualizer');
                        this.renderer = new UIRenderer(canvas, audioParams);
                    }
                    if (!this.analyzer) {
                        this.analyzer = new MorseAnalyzer(audioParams);
                    }

                    this.timeDomainData = new Uint8Array(analyserNode.fftSize);
                    this.frequencyData = new Uint8Array(analyserNode.frequencyBinCount);
                }
                
                this.update();
            } catch (error) {
                console.error('Error accessing microphone:', error);
                alert('マイクの取得に失敗しました。アクセスを許可してください。');
            }
        } else {
            this.audioCapturer.stop();
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
        }
    }

    /**
     * 毎フレーム呼び出される更新処理。
     */
    update() {
        const analyser = this.audioCapturer.getAnalyser();
        if (analyser && this.analyzer) {
            analyser.getByteTimeDomainData(this.timeDomainData);
            analyser.getByteFrequencyData(this.frequencyData);

            const analysisResult = this.analyzer.analyze(this.frequencyData);

            this.renderer.render(this.timeDomainData, this.frequencyData, analysisResult);
        }

        this.animationFrameId = requestAnimationFrame(this.update.bind(this));
    }
}

new App();