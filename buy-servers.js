/** @param {NS} ns */
export async function main(ns) {
	const limit = 25;
	const count = ns.args[0] || 25;
	const ramPow = ns.args[1] || 10;  // GB, max 2^20
	const ram = Math.pow(2, ramPow);
	const ownedCount = ns.getPurchasedServers().length;

	if(count + ownedCount > limit) {
		ns.tprint(`Error: can only buy ${limit - ownedCount} more servers`);
		return;
	}
	else if(ramPow > 20 || ramPow % 1 != 0) {
		ns.tprint(`Error: ${ramPow} is not a valid RAM power (1-20)`);
		return;
	}

	const cost = count * ns.getPurchasedServerCost(ram);
	const player = ns.getPlayer();

	if(cost > player.money) {
		ns.tprint(`Error: not enough money (need $${ns.nFormat(cost, '0.0a')})`);
		return;
	}

	ns.tprint(`Attempting to buy ${count} ${ns.nFormat(ram * 1e9, '0.00b')} servers for $${ns.nFormat(cost, '0.0a')}`);
	for(let i = 0; i < count; i++) {
		let hostname = `cluster-${ownedCount + i + 1}`;
		if(ns.purchaseServer(hostname, ram) != '') {
			ns.tprint(`Bought "${hostname}" successfully`);
		}
		else {
			ns.tprint(`Error: failed to buy "${hostname}"`);
			break;
		}
	}
}
