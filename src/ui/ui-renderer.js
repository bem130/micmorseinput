/**
 * @fileoverview Canvasへの描画処理
 * @description
 * このファイルは、HTMLの`<canvas>`要素へのすべての描画処理を担当します。
 * 音声データや分析結果を視覚的に表現することが目的です。
 *
 * 現在の戦略:
 * 1. 【完全再描画】毎フレームCanvas全体をクリアし、すべての要素をゼロから再描画します。
 * 2. 【履歴の保持】スペクトログラム、音量、そして分析された周波数の履歴をそれぞれ配列に保持します。
 * 3. 【時間軸のスケール】約5秒間の履歴データを表示領域全体に引き伸ばして描画します。
 *    これにより、モールス信号の短点・長点といった短いイベントが詳細に確認できるようになります。
 * 4. 【スペクトログラム上のハイライト】分析された周波数の履歴を、スペクトログラム上に暗い線として重ねて描画し、口笛の音の軌跡を視覚的に強調します。
 * 5. 【デコード情報の可視化】音量履歴のグラフ上に、デコードに使われる音量の閾値を線で表示します。
 *    さらに、その閾値に基づいて判定された短点・長点・スペース区間を、グラフ下部に色付きの
 *    マーカーとして描画し、デコードの過程を直感的に理解できるようにします。
 */

export class UIRenderer {
    /**
     * @param {HTMLCanvasElement} canvas - 描画対象のCanvas要素。
     * @param {object} audioParams - オーディオ関連のパラメータ。
     * @param {object} decoder - MorseDecoderのインスタンス。
     */
    constructor(canvas, audioParams, decoder) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { willReadFrequently: true });
        this.width = canvas.width;
        this.height = canvas.height;
        
        this.decoder = decoder;

        this.sampleRate = audioParams.sampleRate;
        this.fftSize = audioParams.fftSize;

        this.layout = { labelMargin: 40, spectrumWidth: 60, padding: 15 };

        this.minFreq = 100;
        this.maxFreq = this.sampleRate / 2;
        this.logMinFreq = Math.log(this.minFreq);
        this.logFreqRange = Math.log(this.maxFreq) - this.logMinFreq;

        this.volumeHistory = [];
        this.spectrogramHistory = [];
        this.frequencyHistory = [];
        
        // 5秒間の履歴を保持 (5 seconds * 60 fps = 300 frames)
        this.maxHistorySize = 300; 
    }

    /**
     * 描画内容を更新します。
     * @param {Uint8Array} timeDomainData - 時間領域のデータ。
     * @param {Uint8Array} frequencyData - 周波数領域のデータ。
     * @param {{dominantFreqIndex: number, targetVolume: number}} analysisResult - 音声分析結果。
     */
    render(timeDomainData, frequencyData, analysisResult) {
        this.volumeHistory.push(analysisResult.targetVolume);
        if (this.volumeHistory.length > this.maxHistorySize) this.volumeHistory.shift();

        this.spectrogramHistory.push(new Uint8Array(frequencyData));
        if (this.spectrogramHistory.length > this.maxHistorySize) this.spectrogramHistory.shift();
        
        this.frequencyHistory.push(analysisResult.dominantFreqIndex);
        if (this.frequencyHistory.length > this.maxHistorySize) this.frequencyHistory.shift();

        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(0, 0, this.width, this.height);

        this._drawWaveform(timeDomainData);
        this._drawCurrentSpectrum(frequencyData);
        this._drawFrequencyHistoryHighlight();
        this._drawSpectrogram();
        this._drawVolumeHistory();
        this._drawVolumeHistoryDecorations();
        this._drawAxesAndLabels();
        
        if (analysisResult.dominantFreqIndex === -1) {
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

    _drawSpectrogram() {
        const startX = this.layout.labelMargin + this.layout.spectrumWidth;
        const sectionY = this.height / 3;
        const sectionHeight = this.height / 3;
        const drawableWidth = this.width - startX;
        const stepX = drawableWidth / this.maxHistorySize;

        for (let t = 0; t < this.spectrogramHistory.length; t++) {
            const x = startX + t * stepX;
            const historicalFreqData = this.spectrogramHistory[t];
            for (let y = 0; y < sectionHeight; y++) {
                const freqIndex = this._yToFreqIndex(y, sectionHeight);
                if (freqIndex < 0 || freqIndex >= historicalFreqData.length) continue;
                const volume = historicalFreqData[freqIndex];
                this.ctx.fillStyle = this._volumeToColor(volume,0.4);
                this.ctx.fillRect(x, sectionY + y, Math.ceil(stepX), 1);
            }
        }
    }

    _drawVolumeHistory() {
        const sectionY = (this.height / 3) * 2;
        const sectionHeight = this.height / 3;
        const startX = this.layout.labelMargin + this.layout.spectrumWidth;
        const drawableWidth = this.width - startX;
        const stepX = drawableWidth / this.maxHistorySize;

        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = 'rgb(100, 150, 255)';
        this.ctx.beginPath();
        for (let i = 0; i < this.volumeHistory.length; i++) {
            const x = startX + i * stepX;
            const volume = this.volumeHistory[i] / 255.0;
            const y = sectionY + (sectionHeight - (volume * sectionHeight));
            if (i === 0) this.ctx.moveTo(x, y); else this.ctx.lineTo(x, y);
        }
        this.ctx.stroke();
    }
    
    /**
     * @private
     * 音量履歴グラフ上に、デコードに関連する情報を重ねて描画します。
     */
    _drawVolumeHistoryDecorations() {
        if (!this.decoder) return;
    
        const sectionY = (this.height / 3) * 2;
        const sectionHeight = this.height / 3;
        const startX = this.layout.labelMargin + this.layout.spectrumWidth;
        const drawableWidth = this.width - startX;
        const stepX = drawableWidth / this.maxHistorySize;
    
        // 1. 閾値の線を描画
        const threshold = this.decoder.volumeThreshold;
        const yThreshold = sectionY + (sectionHeight - (threshold / 255.0 * sectionHeight));
        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(255, 80, 80, 0.8)';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([4, 2]);
        this.ctx.beginPath();
        this.ctx.moveTo(startX, yThreshold);
        this.ctx.lineTo(this.width, yThreshold);
        this.ctx.stroke();
        this.ctx.restore();
    
        // 2. 短点・長点・スペースなどのマーカーを描画
        const State = { SPACE: 0, MARK: 1 };
        let currentState = this.volumeHistory.length > 0 && this.volumeHistory[0] > threshold ? State.MARK : State.SPACE;
        let runStartIndex = 0;
    
        const drawMarker = (startIndex, endIndex, type) => {
            const x = startX + startIndex * stepX;
            const w = (endIndex - startIndex) * stepX;
            const y = sectionY + sectionHeight - 10; // セクションの下部に描画
            const h = 8;
    
            switch(type) {
                case 'dit': this.ctx.fillStyle = 'rgba(120, 220, 255, 0.7)'; break;
                case 'dah': this.ctx.fillStyle = 'rgba(80, 150, 255, 0.9)'; break;
                case 'char_space': this.ctx.fillStyle = 'rgba(200, 200, 200, 0.5)'; break;
                case 'word_space': this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'; break;
                default: return; // 短いスペースは描画しない
            }
            this.ctx.fillRect(x, y, w, h);
        };
    
        for (let i = 0; i < this.volumeHistory.length; i++) {
            const isMark = this.volumeHistory[i] > this.decoder.volumeThreshold;
            const newState = isMark ? State.MARK : State.SPACE;
    
            if (newState !== currentState) {
                const duration = i - runStartIndex;
                if (duration > 1) { // 非常に短いノイズは無視
                    if (currentState === State.MARK) {
                        const type = duration < this.decoder.dahTimeFrames ? 'dit' : 'dah';
                        drawMarker(runStartIndex, i, type);
                    } else { // SPACE
                        if (duration > this.decoder.wordSpaceFrames) {
                            drawMarker(runStartIndex, i, 'word_space');
                        } else if (duration > this.decoder.charSpaceFrames) {
                            drawMarker(runStartIndex, i, 'char_space');
                        }
                    }
                }
                currentState = newState;
                runStartIndex = i;
            }
        }
        
        // 最後の区間を描画
        const duration = this.volumeHistory.length - runStartIndex;
        if (duration > 1) {
            if (currentState === State.MARK) {
                const type = duration < this.decoder.dahTimeFrames ? 'dit' : 'dah';
                drawMarker(runStartIndex, this.volumeHistory.length, type);
            } else { // SPACE
                 if (duration > this.decoder.wordSpaceFrames) {
                    drawMarker(runStartIndex, this.volumeHistory.length, 'word_space');
                } else if (duration > this.decoder.charSpaceFrames) {
                    drawMarker(runStartIndex, this.volumeHistory.length, 'char_space');
                }
            }
        }
    }
    
    /**
     * スペクトログラム上に、検出された周波数の軌跡を暗い線で描画します。
     * @private
     */
    _drawFrequencyHistoryHighlight() {
        const sectionY = this.height / 3;
        const sectionHeight = this.height / 3;
        const startX = this.layout.labelMargin + this.layout.spectrumWidth;
        const drawableWidth = this.width - startX;
        const stepX = drawableWidth / this.maxHistorySize;

        this.ctx.lineWidth = 10;
        this.ctx.strokeStyle = 'rgba(111, 0, 255, 1)';
        this.ctx.beginPath();
        let lastValidY = -1;
        for (let i = 0; i < this.frequencyHistory.length; i++) {
            const freqIndex = this.frequencyHistory[i];
            
            const x = startX + i * stepX;
            if (freqIndex === -1) {
                lastValidY = -1; // 信号が途切れたらリセット
                continue;
            }
            
            const yPos = this._freqIndexToY(freqIndex, sectionHeight);
            if (yPos < 0 || yPos > sectionHeight) {
                 lastValidY = -1;
                continue;
            }
            
            const y = sectionY + yPos;
            if (lastValidY === -1) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
            lastValidY = y;
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