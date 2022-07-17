import { BaseStock, S4TIXStock, formatNumber } from "stock.lib";

/** @param {NS} ns */
export async function main(ns) {
	BaseStock.ns = ns;

	let portfolio = ['FSIG', 'ECP', 'FLCM', 'BLD', 'APHE', 'OMGA', 'OMTK']
	let stocks = portfolio.map((symbol, i, _) => {
		return new S4TIXStock(symbol);
	});

	ns.disableLog('sleep');
	ns.disableLog('stock.buy');
	ns.disableLog('stock.sell');

	let buys = {};
	let sells = {};
	let output = [];
	while(true) {
		output = [];
		for(let stock of stocks) {
			let forecast = stock.forecast.toFixed(3);
			let price = formatNumber(stock.price.ask);
			let position = stock.position;
			let longs = formatNumber(position.longs, false);
			//ns.print(`[${stock.symbol}] forecast=${forecast}, price=${price}, longs=${longs}`);
			output.push(`[${stock.symbol}] forecast=${forecast}, price=${price}, longs=${longs}\r\n`);
			if(position.longs > 0 && stock.forecast < 0.5) {
				let soldPrice = stock.sellLongs();
				let soldCount = position.longs - stock.position.longs;
				let earned = soldPrice * soldCount;
				let profit = formatNumber(earned - (soldCount * position.askPrice));
				//ns.print(`${stock.symbol} is falling, sold ${formatNumber(soldCount, false)} longs for ${formatNumber(earned)} (profit: ${profit})`);
				let now = (new Date()).toLocaleTimeString();
				buys[stock.symbol] = `<${now}> ${stock.symbol} is falling, sold ${formatNumber(soldCount, false)} longs @ ${formatNumber(soldPrice)} for ${formatNumber(earned)} (${profit})\r\n`;
				delete sells[stock.symbol];
			}
			else if(position.longs == 0 && stock.forecast >= 0.6) {
				let buyPrice = stock.maxLong();
				let boughtCount = stock.position.longs - position.longs;
				if(boughtCount > 0) {
					let spent = formatNumber(buyPrice * boughtCount);
					//ns.print(`${stock.symbol} is rising, bought ${formatNumber(boughtCount, false)} longs for ${spent}`);
					let now = (new Date()).toLocaleTimeString();
					sells[stock.symbol] = `<${now}> ${stock.symbol} is rising, bought ${formatNumber(boughtCount, false)} longs @ ${formatNumber(buyPrice)} for ${spent}\r\n`;
					delete buys[stock.symbol];
				}
			}

			await ns.sleep(500);
		}

		ns.clearLog();
		output.push('\r\n');
		for(let b of Object.values(buys))
			output.push(b);
		for(let s of Object.values(sells))
			output.push(s);
		output[output.length - 1] = output[output.length - 1].trimRight();
		ns.print(...output);

		await ns.sleep(6000);
	}
}
