/** @param {NS} ns */
export async function main(ns) {
	// Warning: this is more powerful than even the dev menu; full game state control. Meta-speedrun anyone? ;)
	let win = top['document'];
	let muiboxen = Array.from(win.querySelectorAll('.MuiBox-root'));
	let props = muiboxen.map(box => Object.entries(box)[1][1].children.props);

	for(let prop of props) {
		if(prop && prop.player) {
			let player = prop.player;

			//ns.tprint(Object.keys(player));
			player.gainMoney(1e40, 'casino');
			player.gainHackingExp(1e50);

			break;
		}
	}
}
