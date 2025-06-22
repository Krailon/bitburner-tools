/** @param {NS} ns */
export async function main(ns) {
	let launcher = ns.args.indexOf("go") == -1;

	if (launcher) {
		// Determine maximum thread count on current host
		let host = ns.getHostname();
		let ram_cost = ns.getScriptRam("stanek.js");
		let free_ram = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
		let thread_count = Math.floor(free_ram / ram_cost);

		ns.print(`Executing Stanek script on ${host} with ${thread_count} threads...`);
		ns.exec("stanek.js", host, thread_count, "go");
		return;
	}

	ns.clearLog();
	while (true) {
		let fragments = ns.stanek.activeFragments();
		for (let fragment of fragments) {
			if (fragment.id < 100) {
				await ns.stanek.chargeFragment(fragment.x, fragment.y);
			}
			else {
				ns.print(`Skipping booster fragment ${fragment.id} @ ${fragment.x},${fragment.y}`);
			}
		}

		await ns.sleep(1000);
	}
}
