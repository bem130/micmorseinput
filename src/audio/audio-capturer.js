/**
 * @fileoverview マイクからの音声入力を取得し、Web Audio APIをセットアップします。
 */

/**
 * マイクからの音声キャプチャとAudioContextの管理を行います。
 */
export class AudioCapturer {
    constructor() {
        /** @private {AudioContext|null} */
        this.audioContext = null;
        /** @private {AnalyserNode|null} */
        this.analyser = null;
        /** @private {MediaStream|null} */
        this.mediaStream = null;
    }

    /**
     * マイクへのアクセスを要求し、音声のキャプチャを開始します。
     * @returns {Promise<void>}
     */
    async start() {
        if (this.audioContext) return;

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioContext = new AudioContext();

            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.analyser = this.audioContext.createAnalyser();
            
            // FFTのサイズ。2048は一般的な値。
            this.analyser.fftSize = 2048;

            source.connect(this.analyser);
            
            console.log("Audio capture started.");

        } catch (err) {
            console.error("Error capturing audio.", err);
            this.stop(); // エラーが発生した場合はリソースを解放
            throw err;
        }
    }

    /**
     * 音声のキャプチャを停止し、関連するリソースを解放します。
     */
    stop() {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
            this.analyser = null;
        }
        console.log("Audio capture stopped.");
    }

    /**
     * 音声分析用のAnalyserNodeを返します。
     * @returns {AnalyserNode|null}
     */
    getAnalyser() {
        return this.analyser;
    }

    /**
     * AudioContextを返します。
     * @returns {AudioContext|null}
     */
    getAudioContext() {
        return this.audioContext;
    }
}