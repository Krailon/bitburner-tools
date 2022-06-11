/** @param {NS} ns */
export async function main(ns) {
	// Unlocks Prototype Tampering exploit for SF -1
	let n = 0;
	let proto = n.__proto__;

	proto.toExponential = x => { return 0 };
}
