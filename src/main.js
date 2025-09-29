/**
 * @fileoverview アプリケーションのエントリーポイント。各モジュールを初期化し、全体の流れを制御します。
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

                    // レンダラーがなければ初期化
                    if (!this.renderer) {
                        const canvas = document.getElementById('visualizer');
                        this.renderer = new UIRenderer(canvas, audioParams);
                    }
                    // アナライザーがなければ初期化
                    if (!this.analyzer) {
                        this.analyzer = new MorseAnalyzer(audioParams);
                    }

                    this.timeDomainData = new Uint8Array(analyserNode.fftSize);
                    this.frequencyData = new Uint8Array(analyserNode.frequencyBinCount);
                }
                
                // 描画ループを開始
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
            // 最新の音声データを取得
            analyser.getByteTimeDomainData(this.timeDomainData);
            analyser.getByteFrequencyData(this.frequencyData);

            // 音声データを分析
            const analysisResult = this.analyzer.analyze(this.frequencyData);

            // 分析結果を基に描画
            this.renderer.render(this.timeDomainData, this.frequencyData, analysisResult);
        }

        // 次のフレームを予約
        this.animationFrameId = requestAnimationFrame(this.update.bind(this));
    }
}

// アプリケーションを起動
new App();