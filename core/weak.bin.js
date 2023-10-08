const runtimeMultiplier = 4.0;

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

		await ns.weaken(target);
	} while (ns.args[1] && ns.getServerSecurityLevel(target) > 0);

}
