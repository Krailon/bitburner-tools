export class SimpleMovingAverage {
	/** @param {number} size */
	constructor(size, defaultChannel) {
		if (typeof size !== 'number') {
			throw new Error(`"${size}" is not a valid window size`);
		}

		this.size = size;
		this.channels = new Map();
		this.defaultChannel = defaultChannel;  // TODO: implement this...?
	}

	/**
	 * @param {string} chan
	 * @returns {boolean}
	 */
	chanIsPrimed(chan) {
		if (chan === undefined) {
			throw new Error('A channel must be specified');
		}
		else if (!this.channels.has(chan)) {
			throw new Error(`No data for channel "${chan}"`);
		}

		return this.channels.get(chan).length == this.size;
	}

	/**
	 * @param {string} chan
	 * @returns {number} 
	 */
	getLatestValue(chan) {
		if (chan === undefined) {
			throw new Error('A channel must be specified');
		}
		else if (!this.channels.has(chan)) {
			throw new Error(`No data for channel "${chan}"`);
		}

		let win = this.channels.get(chan);

		return win[win.length - 1];
	}

	/**
	 * @param {string} chan
	 * @returns {number}
	 */
	getValueCount(chan) {
		if (chan === undefined) {
			throw new Error('A channel must be specified');
		}

		return this.channels.has(chan) ? this.channels.get(chan).length : 0;
	}

	/**
	 * @param {string} chan
	 * @param {number} value
	 * @returns {number}
	 */
	addValue(chan, value) {
		if (chan === undefined) {
			throw new Error('A channel must be specified');
		}
		else if (!this.channels.has(chan)) {
			this.channels.set(chan, []);
		}

		/** @type {number[]} */
		let win = this.channels.get(chan);

		win.push(value);
		if (win.length > this.size) {
			delete win[0];
		}

		return win.length;
	}

	dump(chan, count) {
		if (chan === undefined || count === undefined) {
			throw new Error('Channel & count must be specified');
		}
		else if (typeof count != 'number' || count < 1) {
			throw new Error('Invalid count');
		}

		// Dump {count} oldest values
		let preSize = this.channels.get(chan).length;
		let kept = this.channels.get(chan).slice(count);
		let delta = preSize - kept.length;

		if (delta == 0) {
			throw new Error(`Dump failed?! (count=${count})`);
		}

		this.channels.set(chan, kept);
	}

	/**
	 * @param {string} chan 
	 * @returns {number}
	 */
	calculate(chan) {
		if (chan === undefined) {
			throw new Error('A channel must be specified');
		}
		else if (!this.channels.has(chan)) {
			throw new Error(`No data for channel "${chan}"`);
		}

		let win = this.channels.get(chan);

		return win.reduce((sum, val) => sum + val) / this.size;
	}
};

export class ExponentialMovingAverage {
	/** 
	 * @param {number} size 
	 * @param {number} period
	 */
	constructor(size, period) {
		this.sma = new SimpleMovingAverage(size);
		this.period = (period !== undefined) ? period : size;
		this.smoothing = 2 / (size + 1);
		this.previous = new Map();
	}

	/** @returns {number} */
	get size() {
		return this.sma.size;
	}

	/**
	 * @param {string} chan
	 * @returns {number}
	 */
	getPrevious(chan) {
		if (chan === undefined) {
			throw new Error('A channel must be specified');
		}

		return this.previous.has(chan) ? this.previous.get(chan) : 0;
	}

	/**
	 * @param {string} chan
	 * @returns {number}
	 */
	getValueCount(chan) {
		return this.sma.getValueCount(chan);
	}

	/**
	 * @param {string} chan
	 * @returns {boolean}
	 */
	chanIsPrimed(chan) {
		return this.sma.chanIsPrimed(chan);
	}

	/**
	 * @param {string} chan
	 * @param {number} value
	 * @returns {number}
	 */
	addValue(chan, value) {
		return this.sma.addValue(chan, value);
	}

	/**
	 * @param {string} chan 
	 * @returns {number}
	 */
	calculate(chan) {
		if (chan === undefined) {
			throw new Error('A channel must be specified');
		}

		let sma = this.sma.calculate(chan);
		let previous = this.getPrevious(chan);
		let ema = (sma * this.smoothing) + (previous * (1 - this.smoothing));

		this.previous.set(chan, ema);
		this.sma.dump(chan, this.period);

		let count = this.sma.getValueCount(chan);
		if (count >= this.sma.size) {
			throw new Error(`Dump failed for channel "${chan}" (${count} >= ${this.sma.size}, period=${this.period})`);
		}

		return ema;
	}
};

export class MovingAverageConvergeDiverge {
	/**
	 * @param {number} short
	 * @param {number} long
	 */
	constructor(short, long, sigSize) {
		if (typeof short != 'number' || typeof long != 'number' || typeof sigSize != 'number') {
			throw new Error('Invalid argument (must be numerical)');
		}
		else  if (short < 2 || long < 3 || sigSize < 2) {
			throw new Error('Invalid argument (must be positive)');
		}
		else if (long <= short) {
			throw new Error('Long window must be larger than short window');
		}

		this.shortEMA = new ExponentialMovingAverage(short);
		this.longEMA = new ExponentialMovingAverage(long);
		this.signal = new ExponentialMovingAverage(sigSize);
	}

	/** @returns {number} */
	get short() {
		return this.shortEMA.size;
	}

	/** @returns {number} */
	get long() {
		return this.longEMA.size;
	}

	/**
	 * @param {string} chan
	 * @param {number} value
	 * @returns {number}
	 */
	addValue(chan, value) {
		let shorts = this.shortEMA.addValue(chan, value);
		let longs = this.longEMA.addValue(chan, value);

		if (shorts != longs) {
			throw new Error(`Long-short desync (${shorts} != ${longs})`);
		}

		return longs;
	}

	/**
	 * @param {string} chan
	 * @returns {boolean}
	 */
	chanIsPrimed(chan) {
		return this.longEMA.chanIsPrimed(chan);
	}

	/** 
	 * @param {string} chan
	 * @returns {number}
	 */
	calculate(chan) {
		let short = this.shortEMA.calculate(chan);
		let long = this.longEMA.calculate(chan);
		let macd = short - long;

		let shortCount = this.shortEMA.getValueCount(chan);
		if (shortCount >= this.shortEMA.size) {
			throw new Error(`Post-calculate dump failed for "${chan}" (shorts=${shortCount}/${this.shortEMA.size})`);
		}

		let longCount = this.longEMA.getValueCount(chan);
		if (longCount >= this.longEMA.size) {
			throw new Error(`Post-calculate dump failed for "${chan}" (longs=${longCount}/${this.longEMA.size})`);
		}

		this.signal.addValue(macd);

		return macd;
	}
}
