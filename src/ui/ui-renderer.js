/**
 * @fileoverview Canvasへの描画を担当します。波形、スペクトログラム、音量履歴などを表示します。
 */

export class UIRenderer {
    /**
     * @param {HTMLCanvasElement} canvas - 描画対象のCanvas要素。
     * @param {object} audioParams - オーディオ関連のパラメータ。
     * @param {number} audioParams.sampleRate - サンプリングレート。
     * @param {number} audioParams.fftSize - FFTサイズ。
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

        this.volumeHistory = [];
        this.maxHistorySize = this.width - this.layout.labelMargin - this.layout.spectrumWidth;
    }

    render(timeDomainData, frequencyData, currentVolume) {
        // 音量履歴の更新はスペクトログラムの幅に合わせる
        this.volumeHistory.push(currentVolume);
        if (this.volumeHistory.length > this.maxHistorySize) {
            this.volumeHistory.shift();
        }

        this.ctx.fillStyle = '#fff'; // Default background for axes area
        this.ctx.fillRect(0, 0, this.layout.labelMargin, this.height);

        this._drawWaveform(timeDomainData);
        this._drawCurrentSpectrum(frequencyData);
        this._drawSpectrogram(frequencyData);
        this._drawVolumeHistory();
        this._drawAxesAndLabels();
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
    
    _drawWaveform(dataArray) {
        const sectionHeight = this.height / 3;
        this.ctx.fillStyle = '#fff';
        this.ctx.fillRect(this.layout.labelMargin, 0, this.width - this.layout.labelMargin, sectionHeight);

        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = 'rgb(0, 0, 0)';
        this.ctx.beginPath();
        
        const startX = this.layout.labelMargin;
        const drawableWidth = this.width - startX;
        const sliceWidth = drawableWidth / dataArray.length;
        let x = startX;

        for (let i = 0; i < dataArray.length; i++) {
            const v = dataArray[i] / 255.0;
            const y = v * sectionHeight;

            if (i === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
            x += sliceWidth;
        }
        this.ctx.lineTo(this.width, sectionHeight / 2);
        this.ctx.stroke();
    }

    _drawCurrentSpectrum(dataArray) {
        const sectionY = this.height / 3;
        const sectionHeight = this.height / 3;
        const startX = this.layout.labelMargin;

        this.ctx.fillStyle = '#fff';
        this.ctx.fillRect(startX, sectionY, this.layout.spectrumWidth, sectionHeight);

        for (let i = 0; i < sectionHeight; i++) {
            const freqIndex = this._yToFreqIndex(i, sectionHeight);
            if (freqIndex < 0 || freqIndex >= dataArray.length) continue;

            const volume = dataArray[freqIndex];
            const barWidth = (volume / 255.0) * this.layout.spectrumWidth;
            
            this.ctx.fillStyle = this._volumeToColor(volume, 0.9);
            this.ctx.fillRect(startX, sectionY + i, barWidth, 1);
        }
    }

    _drawSpectrogram(dataArray) {
        const startX = this.layout.labelMargin + this.layout.spectrumWidth;
        const spectrogramWidth = this.width - startX;
        const sectionY = this.height / 3;
        const sectionHeight = this.height / 3;

        if (spectrogramWidth > 1) {
            const imageData = this.ctx.getImageData(startX + 1, sectionY, spectrogramWidth - 1, sectionHeight);
            this.ctx.putImageData(imageData, startX, sectionY);
        }

        for (let i = 0; i < sectionHeight; i++) {
            const freqIndex = this._yToFreqIndex(i, sectionHeight);
            if (freqIndex < 0 || freqIndex >= dataArray.length) continue;
            
            const volume = dataArray[freqIndex];
            this.ctx.fillStyle = this._volumeToColor(volume);
            this.ctx.fillRect(this.width - 1, sectionY + i, 1, 1);
        }
    }

    _drawVolumeHistory() {
        const sectionY = (this.height / 3) * 2;
        const sectionHeight = this.height / 3;
        const startX = this.layout.labelMargin + this.layout.spectrumWidth;

        this.ctx.fillStyle = '#fff';
        this.ctx.fillRect(this.layout.labelMargin, sectionY, this.width - this.layout.labelMargin, sectionHeight);
        
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = 'rgb(50, 50, 200)';
        this.ctx.beginPath();
        
        for (let i = 0; i < this.volumeHistory.length; i++) {
            const x = startX + i;
            const volume = this.volumeHistory[i] / 255.0;
            const y = sectionY + (sectionHeight - (volume * sectionHeight));
            
            if (i === 0) this.ctx.moveTo(x, y);
            else this.ctx.lineTo(x, y);
        }
        this.ctx.stroke();
    }

    _drawAxesAndLabels() {
        this.ctx.fillStyle = 'black';
        this.ctx.font = '12px sans-serif';

        this.ctx.textAlign = 'left';
        this.ctx.fillText('Waveform', this.layout.padding, this.layout.padding);
        this.ctx.fillText('Spectrum', this.layout.padding, this.height / 3 + this.layout.padding);
        this.ctx.fillText('Volume History', this.layout.padding, (this.height / 3) * 2 + this.layout.padding);

        const sectionY = this.height / 3;
        const sectionHeight = this.height / 3;
        const freqTicks = [250, 500, 1000, 2000, 4000, 8000, 16000];
        
        this.ctx.textAlign = 'right';
        this.ctx.strokeStyle = '#eee';
        this.ctx.lineWidth = 1;

        freqTicks.forEach(freq => {
            const yPos = this._freqToY(freq, sectionHeight);
            if (yPos >= 0 && yPos < sectionHeight) {
                const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
                this.ctx.fillText(label, this.layout.labelMargin - 5, sectionY + yPos + 4);
                
                this.ctx.beginPath();
                this.ctx.moveTo(this.layout.labelMargin, sectionY + yPos + 0.5);
                this.ctx.lineTo(this.width, sectionY + yPos + 0.5);
                this.ctx.stroke();
            }
        });
    }
    
    _volumeToColor(volume, alpha = 1.0) {
        const hue = 240 - (volume / 255.0) * 240;
        const effectiveAlpha = volume < 20 ? 0.0 : alpha;
        return `hsla(${hue}, 100%, 50%, ${effectiveAlpha})`;
    }

    clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
    }
}