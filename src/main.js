/**
 * @fileoverview アプリケーションのエントリーポイント。各モジュールを初期化し、全体の流れを制御します。
 */

import { AudioCapturer } from './audio/audio-capturer.js';
import * as DomController from './ui/dom-controller.js';
import { UIRenderer } from './ui/ui-renderer.js';

class App {
    constructor() {
        this.audioCapturer = new AudioCapturer();
        this.renderer = null; // Will be initialized on start
        this.animationFrameId = null;

        this.timeDomainData = null;
        this.frequencyData = null;

        // UIを初期化し、状態変更時のコールバックとCanvasのIDを渡す
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
                
                const analyser = this.audioCapturer.getAnalyser();
                if (analyser) {
                    // UIRendererをAudioContextの情報を使って初期化
                    if (!this.renderer) {
                        const canvas = document.getElementById('visualizer');
                        const audioContext = this.audioCapturer.getAudioContext();
                        this.renderer = new UIRenderer(canvas, {
                            sampleRate: audioContext.sampleRate,
                            fftSize: analyser.fftSize
                        });
                    }

                    this.timeDomainData = new Uint8Array(analyser.fftSize);
                    this.frequencyData = new Uint8Array(analyser.frequencyBinCount);
                }
                
                this.update();
            } catch (error) {
                alert('マイクの取得に失敗しました。アクセスを許可してください。');
                // TODO: ボタンの状態を元に戻すなどのUI更新
            }
        } else {
            this.audioCapturer.stop();
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
            // 停止時にクリアするのは任意だが、ここではクリアしないでおく
            // if (this.renderer) {
            //     this.renderer.clear();
            // }
        }
    }

    /**
     * 毎フレーム呼び出される更新処理。
     */
    update() {
        const analyser = this.audioCapturer.getAnalyser();
        if (analyser) {
            analyser.getByteTimeDomainData(this.timeDomainData);
            analyser.getByteFrequencyData(this.frequencyData);

            let currentVolume = 0;
            for (const value of this.frequencyData) {
                if (value > currentVolume) {
                    currentVolume = value;
                }
            }

            this.renderer.render(this.timeDomainData, this.frequencyData, currentVolume);
        }

        this.animationFrameId = requestAnimationFrame(this.update.bind(this));
    }
}

new App();