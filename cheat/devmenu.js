/** @param {NS} ns */
export async function main(ns) {
	// Warning: the dev menu isn't very fun, you can do anything you want.
	let win = top['document'];
	let muiboxen = Array.from(win.querySelectorAll('.MuiBox-root'));
	let props = muiboxen.map(box => Object.entries(box)[1][1].children.props);

	for(let prop of props) {
		if(prop && prop.router) {
			prop.router.toDevMenu();
			break;
		}
	}
}
