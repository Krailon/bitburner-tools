/** @param {NS} ns */
export async function main(ns) {
	// Unlocks Time Compression exploit for SF -1
	performance.now = _ => {
		return 0;	
	};
}
