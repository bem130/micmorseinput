/**
 * @fileoverview Canvasへの描画を担当します。波形、スペクトログラム、音量履歴などを表示します。
 */

export class UIRenderer {
    /**
     * @param {HTMLCanvasElement} canvas - 描画対象のCanvas要素。
     * @param {object} audioParams - オーディオ関連のパラメータ。
     */
    constructor(canvas, audioParams) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { willReadFrequently: true });
        this.width = canvas.width;
        this.height = canvas.height;

        this.sampleRate = audioParams.sampleRate;
        this.fftSize = audioParams.fftSize;

        this.layout = { labelMargin: 40, spectrumWidth: 60, padding: 15 };

        this.minFreq = 100;
        this.maxFreq = this.sampleRate / 2;
        this.logMinFreq = Math.log(this.minFreq);
        this.logFreqRange = Math.log(this.maxFreq) - this.logMinFreq;

        // 【変更】描画に必要な履歴データを保持する配列
        this.volumeHistory = [];
        this.spectrogramHistory = [];
        this.maxHistorySize = this.width - this.layout.labelMargin - this.layout.spectrumWidth;
    }

    /**
     * 描画内容を更新します。
     * @param {Uint8Array} timeDomainData - 時間領域のデータ。
     * @param {Uint8Array} frequencyData - 周波数領域のデータ。
     * @param {{dominantFreqIndex: number, targetVolume: number}} analysisResult - 音声分析結果。
     */
    render(timeDomainData, frequencyData, analysisResult) {
        // --- 履歴データの管理 ---
        // 音量履歴
        this.volumeHistory.push(analysisResult.targetVolume);
        if (this.volumeHistory.length > this.maxHistorySize) {
            this.volumeHistory.shift();
        }
        // スペクトログラム履歴（必ずコピーを保存する）
        this.spectrogramHistory.push(new Uint8Array(frequencyData));
        if (this.spectrogramHistory.length > this.maxHistorySize) {
            this.spectrogramHistory.shift();
        }

        // --- 描画処理 ---
        // 【変更】毎フレーム、Canvas全体をクリア
        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // 各セクションの描画
        this._drawWaveform(timeDomainData);
        this._drawCurrentSpectrum(frequencyData);
        this._drawSpectrogram(); // 引数が不要に
        this._drawVolumeHistory();
        this._drawAxesAndLabels();
        
        // オーバーレイの描画
        if (analysisResult.dominantFreqIndex !== -1) {
            this._drawTargetFrequencyHighlight(analysisResult.dominantFreqIndex);
        } else {
            this._drawNoTargetMessage();
        }
    }
    
    _yToFreqIndex(y, sectionHeight) {
        const yRatio = 1 - (y / sectionHeight);
        const logFreq = this.logMinFreq + yRatio * this.logFreqRange;
        const freq = Math.exp(logFreq);
        return Math.floor(freq * this.fftSize / this.sampleRate);
    }
    
    _freqToY(freq, sectionHeight) {
        if (freq < this.minFreq) return sectionHeight;
        if (freq > this.maxFreq) return 0;
        const logFreq = Math.log(freq);
        const yRatio = 1 - ((logFreq - this.logMinFreq) / this.logFreqRange);
        return yRatio * sectionHeight;
    }
    
    _freqIndexToY(freqIndex, sectionHeight) {
        if (freqIndex < 0) return -1;
        const freq = freqIndex * this.sampleRate / this.fftSize;
        return this._freqToY(freq, sectionHeight);
    }
    
    _drawWaveform(dataArray) {
        const sectionHeight = this.height / 3;
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = 'rgb(220, 220, 220)';
        this.ctx.beginPath();
        const startX = this.layout.labelMargin;
        const drawableWidth = this.width - startX;
        const sliceWidth = drawableWidth / dataArray.length;
        let x = startX;
        for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i] / 255.0;
            const y = v * sectionHeight;
            if (i === 0) this.ctx.moveTo(x, y); else this.ctx.lineTo(x, y);
            x += sliceWidth;
        }
        this.ctx.lineTo(this.width, sectionHeight / 2);
        this.ctx.stroke();
    }

    _drawCurrentSpectrum(dataArray) {
        const sectionY = this.height / 3;
        const sectionHeight = this.height / 3;
        const startX = this.layout.labelMargin;
        const rightEdge = startX + this.layout.spectrumWidth;
        for (let i = 0; i < sectionHeight; i++) {
            const freqIndex = this._yToFreqIndex(i, sectionHeight);
            if (freqIndex < 0 || freqIndex >= dataArray.length) continue;
            const volume = dataArray[freqIndex];
            const barWidth = (volume / 255.0) * this.layout.spectrumWidth;
            this.ctx.fillStyle = this._volumeToColor(volume, 0.9);
            this.ctx.fillRect(rightEdge - barWidth, sectionY + i, barWidth, 1);
        }
    }

    /**
     * @private
     * 【修正】履歴データを用いてスペクトログラム全体を再描画します。
     */
    _drawSpectrogram() {
        const startX = this.layout.labelMargin + this.layout.spectrumWidth;
        const sectionY = this.height / 3;
        const sectionHeight = this.height / 3;

        // 履歴内の各データ（各時刻の周波数データ）をループ
        for (let t = 0; t < this.spectrogramHistory.length; t++) {
            const x = startX + t; // X座標は時刻（履歴のインデックス）に対応
            const historicalFreqData = this.spectrogramHistory[t];

            // Y座標（ピクセル）をループして垂直線を引く
            for (let y = 0; y < sectionHeight; y++) {
                const freqIndex = this._yToFreqIndex(y, sectionHeight);
                if (freqIndex < 0 || freqIndex >= historicalFreqData.length) continue;

                const volume = historicalFreqData[freqIndex];
                this.ctx.fillStyle = this._volumeToColor(volume);
                this.ctx.fillRect(x, sectionY + y, 1, 1);
            }
        }
    }

    _drawVolumeHistory() {
        const sectionY = (this.height / 3) * 2;
        const sectionHeight = this.height / 3;
        const startX = this.layout.labelMargin + this.layout.spectrumWidth;
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = 'rgb(100, 150, 255)';
        this.ctx.beginPath();
        for (let i = 0; i < this.volumeHistory.length; i++) {
            const x = startX + i;
            const volume = this.volumeHistory[i] / 255.0;
            const y = sectionY + (sectionHeight - (volume * sectionHeight));
            if (i === 0) this.ctx.moveTo(x, y); else this.ctx.lineTo(x, y);
        }
        this.ctx.stroke();
    }

    _drawAxesAndLabels() {
        this.ctx.fillStyle = 'white';
        this.ctx.font = '12px sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.fillText('波形', this.layout.padding, this.layout.padding);
        this.ctx.fillText('スペクトル', this.layout.padding, this.height / 3 + this.layout.padding);
        this.ctx.fillText('音量履歴', this.layout.padding, (this.height / 3) * 2 + this.layout.padding);
        const sectionY = this.height / 3;
        const sectionHeight = this.height / 3;
        const freqTicks = [250, 500, 1000, 2000, 4000, 8000, 16000];
        this.ctx.textAlign = 'right';
        this.ctx.strokeStyle = '#444';
        this.ctx.lineWidth = 1;
        for (const freq of freqTicks) {
            const yPos = this._freqToY(freq, sectionHeight);
            if (yPos >= 0 && yPos < sectionHeight) {
                const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
                this.ctx.fillText(label, this.layout.labelMargin - 5, sectionY + yPos + 4);
                this.ctx.beginPath();
                this.ctx.moveTo(this.layout.labelMargin, sectionY + yPos + 0.5);
                this.ctx.lineTo(this.width, sectionY + yPos + 0.5);
                this.ctx.stroke();
            }
        }
    }

    _drawTargetFrequencyHighlight(dominantFreqIndex) {
        const sectionY = this.height / 3;
        const sectionHeight = this.height / 3;
        const y = this._freqIndexToY(dominantFreqIndex, sectionHeight);
        if (y === -1) return;

        const highlightHeight = 7;
        const halfHeight = Math.floor(highlightHeight / 2);
        const topY = sectionY + y - halfHeight;
        const bottomY = sectionY + y + halfHeight;
        const startX = this.layout.labelMargin;
        const endX = this.width;

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.fillRect(startX, sectionY, endX - startX, topY - sectionY);
        this.ctx.fillRect(startX, bottomY, endX - startX, (sectionY + sectionHeight) - bottomY);
    }

    _drawNoTargetMessage() {
        const sectionY = this.height / 3;
        const sectionHeight = this.height / 3;
        const centerX = this.layout.labelMargin + (this.width - this.layout.labelMargin) / 2;
        const centerY = sectionY + sectionHeight / 2;

        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        this.ctx.font = '16px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('分析対象が見つかりません', centerX, centerY);
    }
    
    _volumeToColor(volume, alpha = 1.0) {
        const hue = 240 - (volume / 255.0) * 240;
        const effectiveAlpha = volume < 25 ? 0.0 : alpha;
        return `hsla(${hue}, 100%, 50%, ${effectiveAlpha})`;
    }

    clear() {
        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(0, 0, this.width, this.height);
    }
}