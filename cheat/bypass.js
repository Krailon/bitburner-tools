/** @param {NS} ns */
export async function main(ns) {
	// Unlocks Bypass exploit for SF -1
    ns.tprint('Running bypass...');
	ns.bypass(top['document']);
}
