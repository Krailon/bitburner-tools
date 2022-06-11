/** @param {NS} ns */
export async function main(ns) {
	// Unlocks Bypass exploit
    ns.tprint('Running bypass...');
	ns.bypass(top['document']);
}
