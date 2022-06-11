/*
  Back Orifice - A hat tip to the OG backdoor
*/

/** @param {NS} ns */
const findPath = async (ns, target) => {
	let queue = [];
	let paths = [['home']];

	while(true) {
		for(let path of paths) {
			let hood = ns.scan(path[path.length - 1]);

			for(let adj of hood) {
				if(adj == target) {
					return path.concat([adj]);
				}
				else if(path.indexOf(adj) == -1) {
					queue.push(path.concat([adj]));
				}
			}
		}
		paths = queue;
		queue = [];

		await ns.sleep(100);
	}
};

const termFocus = () => {
	let termBtn = doc.querySelectorAll('.css-1e1vz9s')[2];
	let handlers = termBtn[Object.keys(termBtn)[1]];

	handlers.onClick({target: termBtn});
};

const termInject = (term, cmd) => {
	// Switch focus to terminal
	//termFocus();

	let handlers = Object.keys(term)[1];
	term.value = cmd;
	term[handlers].onChange({target: term});
	term[handlers].onKeyDown({key: 'Enter', preventDefault: ()=>null});
};

/** @param {NS} ns */
export async function main(ns) {
	ns.disableLog('sleep');
	ns.disableLog('scan');
	ns.clearLog();
	ns.print('Waiting for target designation...');

	const backdoorDelay = 15000;
	const waitDelay = 5000;
	const doc = parent['document'];
	const term = doc.querySelector('#terminal-input');
	while(true) {
		let target = ns.readPort(1);

		if(target != 'NULL PORT DATA') {
			let path = await findPath(ns, target);
			let cmd = path.join(';connect ') + '; backdoor';

			ns.print(`Got target ${target}:\r\n${cmd}\r\n`);
			termInject(term, cmd);
			await ns.sleep(backdoorDelay);  // Some servers take forever to backdoor -.-'
		}
		else {
			await ns.sleep(waitDelay);
		}
	}
}
