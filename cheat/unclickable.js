/** @param {NS} ns */
export async function main(ns) {
	// Unlocks Unclickable exploit for SF -1
	const elem = top['document'].getElementById('unclickable');

	elem[Object.keys(elem)[1]].onClick({target: elem});
}
