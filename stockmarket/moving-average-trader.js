import { BaseStock, TIXStock } from 'stock.lib';
import { ExponentialMovingAverage, MovingAverageConvergeDiverge } from 'moving-average';

// TODO: tweak experimentally
const PERIOD = 6000;  // 6s
const EMA_SIZE = 20;
const MACD_SHORT = 12;  
const MACD_LONG = 24;
const MACD_SIG = 9;
const THRESHOLD = 2000;
const SPEND_RATIO = 0.5;  // Spend 50% of pool
const BUY_CYCLES = 5;
const SELL_CYCLES = 3;

/**
 * @param {TIXStock} stock
 * @param {Map} [sim]
 * @param {boolean} [short]
 * @return {boolean}
 */
function holdingStock(stock, sim, short) {
	if (stock.constructor !== TIXStock) {
		throw new Error('Invalid stock');
	}
	else if (sim !== undefined && sim.constructor !== Map) {
		throw new Error('Invalid sim');
	}
	else if (short !== undefined && typeof short != 'boolean') {
		throw new Error('Short parameter must be boolean');
	}

	if (sim !== undefined) {
		return sim.has(stock.symbol);  // Sim only supports longs for now
	}
	else {
		let position = stock.position;
		let held = short ? position.short : position.long;

		return held > 0;
	}
}

/**
 * @param {TIXStock} stock
 * @param {Map} [sim]
 * @param {boolean} [short]
 * @return {object}
 */
function getPosition(stock, sim, short) {
	if (stock.constructor !== TIXStock) {
		throw new Error('Invalid stock');
	}
	else if (sim !== undefined && sim.constructor !== Map) {
		throw new Error('Invalid sim');
	}
	else if (short !== undefined && typeof short != 'boolean') {
		throw new Error('Short parameter must be boolean');
	}

	if (sim !== unfedined) {
		return sim.get(stock.symbol);  // Sim only supports longs for now
	}
	else {
		let position = stock.position;

		return {
			count: short ? position.short : position.long,
			price: short ? position.bidPrice : position.askPrice
		};
	}
}

/**
 * @param {TIXStock} stock
 * @param {number} count
 * @param {Map} [sim]
 * @return {number}
 */
function buyStock(stock, count, sim) {
	if (stock.constructor !== TIXStock) {
		throw new Error('Invalid stock');
	}
	else if (typeof count != 'number' || count < 0) {
		throw new Error(`Invalid count for ${stock.symbol} (${count})`);
	}
	else if (sim !== undefined && sim.constructor !== Map) {
		throw new Error('Invalid sim');
	}

	if (count == 0) {
		return 0;
	}

	// Prevent re-buying already held stock
	let position = stock.position;
	if (position.longs > 0) {
		return 0;
	}

	if (sim !== undefined) {
		if (!sim.has(stock.symbol)) {
			// Simulated buy
			sim.set(stock.symbol, {
				count: count,
				price: stock.price.ask
			});
		}
	}
	else {
		// Real buy
		stock.buyLongs(count);
	}

	return count;
}

/**
 * @param {TIXStock} stock
 * @param {number} count
 * @param {Map} [sim]
 * @return {number}
 */
function sellStock(stock, count, sim) {
	if (stock.constructor !== TIXStock) {
		throw new Error('Invalid stock');
	}
	else if (typeof count != 'number' || count < 0) {
		throw new Error(`Invalid count for ${stock.symbol} (${count})`);
	}
	else if (sim !== undefined && sim.constructor !== Map) {
		throw new Error('Invalid sim');
	}

	if (count == 0) {
		return 0;
	}

	if (sim !== undefined) {
		// Simulated sell
		sim.delete(stock.symbol);
	}
	else {
		// Ensure holding enough stock to sell specified count, defaulting to all otherwise
		let position = stock.position;
		if (position.longs < 1) {
			return 0;
		}
		else if (position.longs < count) {
			count = position.longs;
		}

		// Real sell
		stock.sellLongs(count);
	}

	return count;
}

/** @param {NS} ns */
export async function main(ns) {
	BaseStock.ns = ns;

	ns.disableLog('sleep');
	ns.disableLog('stock.buyStock');
	ns.disableLog('stock.sellStock');
	ns.clearLog();

	/** @type {TIXStock[]} stocks */
	let stocks = ns.stock.getSymbols().map((symbol, i, _) => {
		return new TIXStock(symbol);
	});
	let buyWatch = new Map();
	let sellWatch = new Map();
	let sim = new Map();  // Set to undefined to disable simulation (enabling real trading)
	let movements = new Map();
	let ema = new ExponentialMovingAverage(EMA_SIZE);
	//let macd = new MovingAverageConvergeDiverge(MACD_SHORT, MACD_LONG, MACD_SIG);
	let primed = false;
	let pool = ns.getPlayer().money;

	ns.tprint(`[StockMarket] Starting MA-Trader with pool of $${ns.formatNumber(pool, 1)}`);
	ns.print('Collecting data...');
	while (true) {
		let roundInit = false;

		// Give up if pool is empty
		if (pool < 1) {
			ns.tprint('[StockMarket] Pool is dry; quiting!');
			break;
		}

		for (let stock of stocks) {
			let now = (new Date()).toISOString();
			let {ask, bid} = stock.price;

			ema.addValue(stock.symbol, ask);

			// Calculate MA for current window
			if (!ema.chanIsPrimed(stock.symbol)) {
				// Wait for SMA window to fill
				//ns.print(`Waiting for ${stock.symbol} SMA window to fill... (${ema.sma.prices.get(stock.symbol).length}/${EMA_SIZE})`);
				continue;
			}
			else if (!primed) {
				primed = true;
			}

			let previous = ema.getPrevious(stock.symbol);
			let movingAverage = ema.calculate(stock.symbol);

			//macd.addValue(stock.symbol, movingAverage);
			if (previous == 0) {
				// Wait for two EMAs to get trend
				//ns.print(`Waiting for 2nd ${stock.symbol} EMA to get trend...`);
				continue;
			}

			let macdv = '-'; //macd.chanIsPrimed(stock.symbol) ? macd.calculate(stock.symbol).toFixed(1) : '-';
			if (macdv !== '-') {
				// TODO
			}

			if (!roundInit) {
				ns.clearLog();
				ns.print(`Trends @ ${now}:`);
				roundInit = true;
			}

			// Calculate trend over window
			let trend = (movingAverage - previous).toFixed(1);
			let movement;

			if (trend < -THRESHOLD) {
				if (!holdingStock(stock, sim) && !sellWatch.has(stock.symbol)) {
					// Color if below -threshold
					trend = `\u001b[36m${trend}\u001b[0m`;

					if (!buyWatch.has(stock.symbol)) {
						//movements.set(stock.symbol, 'W0');  // Watching to buy
						buyWatch.set(stock.symbol, 0);
					}

					let cycleCount = buyWatch.get(stock.symbol) + 1;
					buyWatch.set(stock.symbol, cycleCount);

					// 1a) Count buy-wait cycles
					movement = `+W${cycleCount}`;
					if (cycleCount >= BUY_CYCLES) {
						movement = `\u001b[35m${movement}\u001b[0m`;
					}

					movements.set(stock.symbol, movement);
				}
			}
			else if (buyWatch.has(stock.symbol)) {
				let watchCycles = buyWatch.get(stock.symbol);
				movement = movements.get(stock.symbol).replaceAll('\u001b[35m', '').replaceAll('\u001b[0m', '').replaceAll('/', '');

				buyWatch.delete(stock.symbol);  // Unwatch

				if (watchCycles >= BUY_CYCLES) {  // TODO: tweak buy watch cycle threshold
					// 2) Buy stock @ rising inflection after minimum (simulated for now)
					//sim.set(stock.symbol, ask);

					let spend = pool * SPEND_RATIO;
					let count = Math.floor(spend / ask);
					let bought = buyStock(stock, count, sim);

					if (bought > 0) {
						let spent = 100000 + (bought * ask);
						pool -= spent;

						movements.set(stock.symbol, `${movement};+$${ns.formatNumber(ask, 0)}`);
						ns.tprint(`[StockMarket] Bought ${bought} simulated ${stock.symbol} for $${ns.formatNumber(spent, 1)} (pool: $${ns.formatNumber(pool, 1)})`);  // Debug
					}
					else {
						ns.tprint(`[StockMarket] Insufficient pool funds to buy ${stock.symbol} @ $${ns.formatNumber(ask, 1)} (pool: ${ns.formatNumber(pool, 1)})`);  // Debug
					}
				}
				else {
					// 1b) Abandon buy-waiting if watch didn't last long enough (1 cycle)
					//movements.delete(stock.symbol);
					movements.set(stock.symbol, `/${movement}/`);
				}
			}

			if (trend > THRESHOLD) {
				if (holdingStock(stock, sim)) {
					// Color if above threshold
					trend = `\u001b[32m${trend}\u001b[0m`;

					if (!sellWatch.has(stock.symbol)) {
						sellWatch.set(stock.symbol, 0);
					}

					let watchCycles = sellWatch.get(stock.symbol) + 1;
					movement = movements.get(stock.symbol).split(':')[0];  // Trim out previous watch count

					// 3) Count sell-wait cycles
					sellWatch.set(stock.symbol, watchCycles);
					movements.set(stock.symbol, `${movement}:-W${watchCycles}`);
				}
			}
			else if (sellWatch.has(stock.symbol)) {
				if (!holdingStock(stock, sim)) {
					throw new Error(`Sell watching but no simulated stock of ${stock.symbol} held`);
				}

				let watchCycles = sellWatch.get(stock.symbol);
				movement = movements.get(stock.symbol).replaceAll('/', '');

				if (watchCycles >= SELL_CYCLES) {
					// Sell stock @ falling inflection after maximum
					let simPos = sim.get(stock.symbol);
					let buyAsk = simPos.price;
					let profitPer = bid - buyAsk;
					let profitRatio = ((profitPer / buyAsk) * 100).toFixed(0);

					if (profitRatio > 0) {
						// 4) Sell all held stock
						sellWatch.delete(stock.symbol);  // Unwatch only after actually selling
						movements.set(stock.symbol, `${movement},-$${ns.formatNumber(bid, 0)},${profitRatio}%`);

						//sim.delete(stock.symbol);
						let sold = sellStock(stock, simPos.count, sim);
						let earned = sold * bid;
						pool += earned;

						ns.tprint(`[StockMarket] Sold ${sold} simulated ${stock.symbol} for $${ns.formatNumber(earned, 1)} @ ${profitRatio}% (pool: $${ns.formatNumber(pool, 1)})`);  // Debug
					}
					else {
						ns.tprint(`[StockMarket] Skipped selling ${stock.symbol} at a loss of ${profitRatio} ($${ns.formatNumber(buyAsk)}, $${ns.formatNumber(bid)}, $${ns.formatNumber(profitPer)})`);
					}
				}
				else {
					movements.set(stock.symbol, `/${movement}/`);
				}
			}

			movement = movements.has(stock.symbol) ? movements.get(stock.symbol) : '-';
			//ns.print(`[${stock.symbol}] ${trend} (ask: ${ask.toFixed(2)}, EMA(t): ${movingAverage.toFixed(2)}, EMA(t-1): ${previous.toFixed(2)})`);  // Debug
			ns.print(`[${stock.symbol}] Trend=${trend}; Ask=$${ns.formatNumber(ask, 1)}; Bid=$${ns.formatNumber(bid, 1)}; Movement: ${movement}`);  // Debug
		}

		await ns.sleep(PERIOD);
	}
}
