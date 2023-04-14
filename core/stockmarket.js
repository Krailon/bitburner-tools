import { BaseStock, S4TIXStock } from "stock.lib";

const init = (ns, symbols) => {
	const stocks = {};
	var position;
	for(let symbol of symbols) {
		position = ns.stock.getPosition(symbol);
		if(position[0]) {
			ns.tprint(`Found stock position for ${symbol}: ${position[0]} ($${position[1]})`);
			stocks[symbol] = {
				longs: position[0],
				longValue: position[1],
				shorts: position[2],
				shortValue: position[3]
			};
		}
	}

	return stocks;
};

/** @param {NS} ns */
const test = async ns => {
	const ignored = ['FSIG'];
	const maxSpend = 10000000;

	const interval = ns.args[0] || 10000;
	const sellThreshold = 100000000;
	const symbols = ns.stock.getSymbols();
	const stocks = init(ns, symbols);
	var forecast, profit, count;

	ns.disableLog('asleep');

	while(true) {
		// For each company/symbol...
		for (let symbol of symbols) {
			// ...check if we own any of their stocks...
			if(symbol in stocks && ignored.indexOf(symbol) == -1) {
				// ...if so, check if it's worth selling them...
				count = stocks[symbol]['longs'];
				profit = ns.stock.getSaleGain(symbol, stocks[symbol]['longs'], 'long');
				forecast = ns.stock.getForecast(symbol);
				ns.print(`Got profit of ${profit} for ${count} ${symbol} stocks`);
				if(profit >= sellThreshold) {  // TODO: integrate forecast
					// ...and sell them if enough profit has been made
					// (ignoring shorts until I unlock them)
					//ns.stock.sell(symbol, count);
					delete stocks[symbol];
					ns.print(`Sold ${count} ${symbol} stocks for ${profit}! 👍`);
				}
			}
			else {
				// TODO
			}
		}

		await ns.asleep(interval);
	}
};

/** @param {NS} ns */
const big_trader = async (ns) => {
	const forecastThreshold = 0.6;  // 60%
	const forecastWindow = 0.05;  // 5%
	const symbols = ["ECP", "MGCP", "BLD", "CLRK", "OMTK", "FSIG", "KGI", "FLCM", "STM", "DCOMM", "HLS", "VITA", "ICRS", "UNV", "AERO", "OMN", "SLRS", "GPH", "NVMD", "WDS", "LXO", "RHOC", "APHE", "SYSC", "CTK", "NTLK", "OMGA", "FNS", "JGN", "SGC", "CTYS", "MDYN", "TITN"];
	const stocks = [];

	ns.disableLog('asleep');
	ns.disableLog('getServerMoneyAvailable');
	//ns.disableLog('buy');

	for(let sym of symbols)
		stocks.push(new Stock(ns, sym));

	// Allocate fund pool
	let pool = Math.floor(ns.getServerMoneyAvailable('home') * 0.05);  // 5% of current funds
	ns.print(`Using pool of $${ns.formatNumber(pool, 1)}`);

	while(true) {
		// Sort by forecast to prioritize increasing value
		stocks.sort((a, b) => b.forecast - a.forecast);

		// Sell low forecasts
		for(let stock of stocks) {
			let { longs, askPrice, shorts, bidPrice, value } = stock.position;
			if(longs > 0 && stock.forecast < 0.5) {
				let expectGain = ns.stock.getSaleGain(stock.symbol, longs, 'Long');
				let sold = stock.sell();
				let actualGain = sold * stock.price.ask;

				pool += actualGain;
				ns.tprint(
					`Selling ${sold}/${longs} ${stock.symbol} for $${ns.formatNumber(actualGain, 1)}/` +
					`$${ns.formatNumber(expectGain, 1)} (${Math.round(stock.forecast*100)}%, $${ns.formatNumber(pool, 1)})`
				);
			}
		}

		// Buy highest forecasted stock up to cap
		for(let stock of stocks) {
			let { longs, askPrice, shorts, bidPrice, value } = stock.position;
			let price = stock.price;
			ns.print(`Processing stock ${stock.symbol} (${Math.round(stock.forecast*100)}%, ${longs}, $${ns.formatNumber(price.ask, 1)})`);

			if(stock.forecast < forecastThreshold) break;  // Sorted so no point going further
			if(longs > 0) continue;  // Don't hoard

			let score = Math.min((stock.forecast - forecastThreshold) / forecastWindow, 1);
			let shareCount = Math.min(ns.stock.getMaxShares(stock.symbol), Math.floor((pool / price.ask) * score));
			ns.print(`${stock.symbol}: ${shareCount} $${ns.formatNumber(price.ask, 1)} (${score}, $${ns.formatNumber(value, 1)}, ${Math.round(stock.forecast*100)}%)`);
			if(shareCount < 0) continue;

			let expectCost = price.ask * shareCount;
			let actualPrice = stock.buyLong(shareCount);
			let actualCost = actualPrice * shareCount;
			pool -= actualCost;

			ns.tprint(
				`Bought ${shareCount} shares of ${stock.symbol} @ $${ns.formatNumber(actualPrice, 1)}/$${ns.formatNumber(askPrice, 1)} ` +
				`($${ns.formatNumber(expectCost, 1)}/$${ns.formatNumber(actualCost, 1)}, $${ns.formatNumber(pool, 1)}, ${Math.round(stock.forecast*100)}%)`
			);
		}

		await ns.asleep(6000);
	}
};

/** @param {NS} ns */
export async function main(ns) {
	BaseStock.ns = ns;

	let portfolio = ['FSIG', 'ECP', 'FLCM', 'BLD', 'APHE', 'OMGA', 'OMTK', 'ICRS', 'JGN']
	let stocks = portfolio.map((symbol, i, _) => {
		return new S4TIXStock(symbol);
	});

	ns.disableLog('sleep');
	ns.disableLog('stock.buyStock');
	ns.disableLog('stock.sellStock');

	let buys = new Map();
	let sells = new Map();
	let output = [];
	while(true) {
		output = [];
		for(let stock of stocks) {
			let forecast = stock.forecast.toFixed(3);
			let price = ns.formatNumber(stock.price.ask, 1);
			let position = stock.position;
			let longs = ns.formatNumber(position.longs, 1);
			//ns.print(`[${stock.symbol}] forecast=${forecast}, price=${price}, longs=${longs}`);
			output.push(`[${stock.symbol}] forecast=${ns.formatNumber(forecast, 1)}%, price=$${price}, longs=${longs}\r\n`);
			if(position.longs > 0 && stock.forecast < 0.5) {
				let soldPrice = stock.sellLongs();
				let soldCount = position.longs - stock.position.longs;
				let earned = soldPrice * soldCount;
				let profit = ns.formatNumber(earned - (soldCount * position.askPrice), 1);
				//ns.print(`${stock.symbol} is falling, sold ${formatNumber(soldCount, false)} longs for ${formatNumber(earned)} (profit: ${profit})`);
				let now = (new Date()).toLocaleTimeString();
				buys.set(stock.symbol, `<${now}> ${stock.symbol} is falling, sold ${ns.formatNumber(soldCount, 1)} longs @ $${ns.formatNumber(soldPrice, 1)} for $${ns.formatNumber(earned, 1)} ($${ns.formatNumber(profit, 1)})\r\n`);
				sells.delete(stock.symbol);
			}
			else if(position.longs == 0 && stock.forecast >= 0.6) {
				let buyPrice = stock.maxLong();
				let boughtCount = stock.position.longs - position.longs;
				if(boughtCount > 0) {
					let spent = ns.formatNumber(buyPrice * boughtCount, 1);
					//ns.print(`${stock.symbol} is rising, bought ${formatNumber(boughtCount, false)} longs for ${spent}`);
					let now = (new Date()).toLocaleTimeString();
					sells.set(stock.symbol, `<${now}> ${stock.symbol} is rising, bought ${ns.formatNumber(boughtCount, 1)} longs @ $${ns.formatNumber(buyPrice, 1)} for $${spent}\r\n`);
					buys.delete(stock.symbol);
				}
			}

			await ns.sleep(500);
		}

		ns.clearLog();
		output.push('\r\n');
		for(let [_, buy] of buys)
			output.push(buy);

		if (buys.size + sells.size > 0) {
			output.push('--------------------------------------------------\r\n');
		}

		for(let [_, sell] of sells)
			output.push(sell);
		output[output.length - 1] = output[output.length - 1].trimRight();
		ns.print(...output);

		await ns.sleep(6000);
	}
}
