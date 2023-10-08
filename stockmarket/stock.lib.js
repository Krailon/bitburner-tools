export class BaseStock {
	/** @type {NS} */
	static ns;
	#_symbol;

	constructor(symbol) {
		this.#_symbol = symbol;
		this.low = 0;
		this.high = 0;
		this.spread = 0;
	}

	get symbol() {
		return this.#_symbol;
	}
}

export class TIXStock extends BaseStock {
	constructor(symbol) {
		super(symbol);
		this.longMin = 1000000;  // $1m minimum
	}

	get maxShares() {
		return TIXStock.ns.stock.getMaxShares(this.symbol);
	}

	get position() {
		let [ longs, askPrice, shorts, bidPrice ] = TIXStock.ns.stock.getPosition(this.symbol);

		return {
			longs,
			askPrice,
			shorts,
			bidPrice
			//value: (longs * this.price.ask) + (shorts * this.price.bid - (shorts * this.price.bid - shorts * this.price.ask))
		};
	}

	get price() {
		let askPrice = TIXStock.ns.stock.getAskPrice(this.symbol);
		let bidPrice = TIXStock.ns.stock.getBidPrice(this.symbol);

		// Update stats each time prices are fetched
		this.spread = askPrice - bidPrice;
		if(bidPrice < this.low)
			this.low = bidPrice;
		else if(askPrice > this.high)
			this.high = askPrice;

		return {
			ask: askPrice,
			bid: bidPrice
		};
	}

	maxLong() {
		let money = TIXStock.ns.getPlayer().money;
		let shares = (money - 100000) / this.price.ask;  // Take 100k commission into account
		shares = Math.floor(Math.min(shares, this.maxShares - this.position.longs));

		if(shares * this.price.ask > this.longMin)
			return this.buyLongs(shares);

		return 0;
	}

	buyLongs(shares) {
		TIXStock.ns.tprint(`[StockMarket] Buying long position ${shares} of ${this.symbol}`);  // Debug

		return TIXStock.ns.stock.buyStock(this.symbol, shares);
	}

	buyShorts(shares) {
		return TIXStock.ns.stock.buyShort(this.symbol, shares);
	}

	longCost(shares) {
		return (shares * this.price.ask) + 100000;
	}

	sellLongs(shares=this.position.longs) {
		TIXStock.ns.tprint(`[StockMarket] Selling long position ${shares} of ${this.symbol}`);  // Debug

		return TIXStock.ns.stock.sellStock(this.symbol, shares);
	}

	sellShorts(shares=this.position.shorts) {
		return TIXStock.ns.stock.sellShort(this.symbol, shares);
	}
}

export class S4TIXStock extends TIXStock {
	constructor(symbol) {
		super(symbol);
	}

	get forecast() {
		return S4TIXStock.ns.stock.getForecast(this.symbol);
	}

	get volatility() {
		return S4TIXStock.ns.stock.getVolatility(this.symbol);
	}

	test2() {
		return S4TIXStock.ns;
	}
}

export const formatNumber = (n, isMoney=true) => {
	const units = ['', 'k', 'm', 'b', 't', 'q', 'u']
	let unit = '';

	while(Math.abs(n) > 1000) {
		n /= 1000;
		unit = units[units.indexOf(unit) + 1];
	}

	return (isMoney ? '$' : '') + `${n.toFixed(2)}${unit}`;
};
