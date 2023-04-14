/** @param {NS} ns */
export async function main(ns) {
	for (let i = 0; i < 21; i++) {
		let ram = Math.pow(2, i);
		let cost = ns.getPurchasedServerCost(ram);

		ns.print(`2^${i}=${ram} @ $${ns.formatNumber(cost, 2)}`);
	}
}
