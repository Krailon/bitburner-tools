const runtimeMultiplier = 3.2;

/** @param {NS} ns */
export async function main(ns) {
	const target = ns.args[0] || 'foodnstuff';
	const next = ns.args[2];
	//const runtime = runtimeMultiplier * ns.getHackTime(target);

	do {
		if(next) {
			let currentTime = performance.now();
			await ns.asleep(next - currentTime);
		}

		await ns.grow(target);
	} while (ns.args[1] && ns.getServerMoneyAvailable(target) < ns.getServerMaxMoney(target));
}
