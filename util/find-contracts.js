/** @param {NS} ns */
export async function main(ns) {
	const queue = ['home'];
	const visited = [];
	var hostCount = 0;
	var foundCount = 0;
	var server, nearby, contracts, contractType;

	while(queue.length > 0) {
		server = queue.pop();
		visited.push(server);
		hostCount++;

		nearby = ns.scan(server);
		for(let host of nearby) {
			if(visited.indexOf(host) == -1) {
				queue.push(host);
			}
		}

		contracts = ns.ls(server, '.cct');
		for(let contract of contracts) {
			foundCount++;
			contractType = ns.codingcontract.getContractType(contract, server);
			ns.tprint(`Found contract "${contract}" (${contractType}) on ${server}`);
		}
	}

	ns.tprint(`Processed ${hostCount} servers and found ${foundCount} contracts`);
}
