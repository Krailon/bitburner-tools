const DEFAULT_MODE = 'money';
const LOG_X = 256;
const LOG_Y = 20;
const LOG_WIDTH = 1500 - LOG_X;
const LOG_HEIGHT = 450 - LOG_Y;

/** @param {NS} ns */
export async function main(ns) {
	let mode = ns.args.indexOf('xp') > -1 ? 'xp' : DEFAULT_MODE;  // TODO: expand modes?
	let drain = ns.args.indexOf('drain') > -1;
	let args = [];

	ns.disableLog('disableLog');
	ns.disableLog('getServerMaxRam');
	ns.disableLog('getServerUsedRam');
	ns.disableLog('exec');
	ns.disableLog('sleep');

	if (!ns.scriptRunning('basic.strategy.js', 'home') && !ns.scriptRunning('singularity.strategy.js', 'home')) {
		if (drain) {
			args.push('drain');
		}

		if (mode == 'xp') {
			ns.print('Experience mode is currently unimplemented!');
			return;
			args.push('xp');
			// TODO
		}

		ns.print('Initiating hacking strategy...');
		// Check available RAM & force basic strategy if not enough for Singularity
		let freeRam = ns.getServerMaxRam('home') - ns.getServerUsedRam('home');
		let singularityRam = ns.getScriptRam('singularity.strategy.js', 'home');
		let script = 'basic.strategy.js';

		if (freeRam >= singularityRam) {
			ns.print('Invoking Singularity strategy!');
			script = 'singularity.strategy.js';
			//pid = ns.exec('singularity.strategy.js', 'home', 1, ...args);
		}
		else {
			ns.print(`Invoking basic strategy due to RAM limitations! (${freeRam} < ${singularityRam})`);
			//pid = ns.exec('basic.strategy.js', 'home', 1, ...args);
		}

		let pid = ns.exec(script, 'home', 1, ...args);
		if (pid) {
			ns.tail(pid, 'home');
			await ns.asleep(500);
			ns.moveTail(LOG_X, LOG_Y, pid);
			ns.resizeTail(LOG_WIDTH, LOG_HEIGHT, pid);
		}
	}
	else {
		ns.print('Hacking strategy already running!');
	}

	if (!ns.scriptRunning('stockmarket.js', 'home')) {
		if (ns.stock.hasWSEAccount() && ns.stock.has4SData() && ns.stock.hasTIXAPIAccess() && ns.stock.has4SDataTIXAPI()) {
			ns.print('Initiating stock market strategy...');
			let pid = ns.exec('stockmarket.js', 'home', 1);
			if (pid) {
				ns.tail(pid, 'home');
				await ns.sleep(500);
				ns.moveTail(1050, 475, pid);
				ns.resizeTail(800, 500, pid);
			}
		}
	}
	else {
		ns.print('Stock market strategy already running!');
	}

	await ns.sleep(5000);
	ns.closeTail();
}
