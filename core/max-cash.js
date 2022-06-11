/** @param {NS} ns */
const suppressLogs = ns => {
	ns.disableLog('sleep');
	ns.disableLog('scan');
	ns.disableLog('exec');
	ns.disableLog('scp');
	ns.disableLog('getServerMaxRam');
	ns.disableLog('getServerUsedRam');
	ns.disableLog('getServerSecurityLevel');
	ns.clearLog();
};

/** @param {NS} ns */
const findServers = async ns => {
	const servers = [];
	const queue = ['home'];
	let hostname, neighbors;

	while(queue.length > 0) {
		hostname = queue.shift();
		neighbors = ns.scan(hostname);

		for(let neighbor of neighbors) {
			if(neighbor == 'home') continue;
			if(servers.indexOf(neighbor) == -1 && queue.indexOf(neighbor) == -1) {
				queue.push(neighbor)
			}
		}

		// Include home
		servers.push(hostname);
		await ns.sleep(100);
	}

	return servers;
};

const getFreeRam = (ns, hostname, reserved) => {
	return ns.getServerMaxRam(hostname) - ns.getServerUsedRam(hostname) - (hostname == 'home' ? reserved : 0);
};

/** @param {NS} ns */
const haveScript = (ns, script) => {
	return ns.fileExists(script, 'home');
};

const getOpenPorts = (server) => {
	let count = 0;
	for(let entry of Object.entries(server)) {
		if(entry[0].indexOf('PortOpen') > -1 && entry[1])
			count++;
	}

	return count;
};

/** @param {NS} ns */
export async function main(ns) {
	suppressLogs(ns);

	const reserved = 10;
	const moneyOffset = 100000;  // Stops hacking to $0
	const drainMode = ns.args.indexOf('drain') > -1;
	let engagements = {};

	while(true) {
		const player = ns.getPlayer();
		let servers = await findServers(ns);
		let maxExp = [0, 1, null];
		ns.print('Starting round @ ' + (new Date()).toLocaleTimeString());

		for(let server of servers) {
			let srv = ns.getServer(server);
			if(server == 'darkweb') continue;  // Skip darkweb

			await ns.sleep(1000);

			// Seed scripts
			for(let act of ['hack', 'weak', 'grow']) {
				let script = `${act}.bin.js`;
				if(!ns.fileExists(script, server))
					await ns.scp(script, 'home', server);
			}

			if(!srv.hasAdminRights) {
				// Not r00ted, attempt to open ports
				if(haveScript(ns, 'BruteSSH.exe') && !srv.sshPortOpen) {
					ns.brutessh(server);
					srv.sshPortOpen = true;
				}
				if(haveScript(ns, 'FTPCrack.exe') && !srv.ftpPortOpen) {
					ns.ftpcrack(server);
					srv.ftpPortOpen = true;
				}
				if(haveScript(ns, 'relaySMTP.exe') && !srv.smtpPortOpen) {
					ns.relaysmtp(server);
					srv.smtpPortOpen = true;
				}
				if(haveScript(ns, 'HTTPWorm.exe') && !srv.httpPortOpen) {
					ns.httpworm(server);
					srv.httpPortOpen = true;
				}
				if(haveScript(ns, 'SQLInject.exe') && !srv.sqlPortOpen) {
					ns.sqlinject(server);
					srv.sqlPortOpen = true;
				}

				// Nuke if enough ports are open
				let openPorts = getOpenPorts(srv);
				if(openPorts >= srv.numOpenPortsRequired) {
					ns.nuke(server);
					ns.print(`R00ted ${server}!`);
				}
				else {
					continue;  // Move on to next host server if can't nuke
				}
			}

			if(!srv.backdoorInstalled && server != 'home' && !srv.purchasedByPlayer && player.hacking >= srv.requiredHackingSkill) {
				// Signal BO if backdooring needed
				//ns.tprint(`Server "${server}" needs backdooring!`);
				await ns.writePort(1, server);
			}

			if(srv.maxRam == 0) continue;  // Skip useless host servers
			let anyTargets = false;
			for(let target of servers) {
				if(target == 'home' || target == 'darkweb') continue;
				let tgt = ns.getServer(target);

				await ns.sleep(500);
				if(!tgt.purchasedByPlayer && tgt.hasAdminRights && tgt.requiredHackingSkill <= player.hacking && tgt.moneyAvailable >= moneyOffset) {
					let hackTime = ns.getHackTime(target);
					let maxRuntime = Math.max(...[hackTime, ns.getGrowTime(target), ns.getWeakenTime(target)]);
					let threads = engagements[target] || null;

					/*
					try {
						let exp = ns.formulas.hacking.hackExp(tgt, ns.getPlayer());
						if((exp / hackTime) > (maxExp[0] / maxExp[1]))
							maxExp = [exp, hackTime, target];
					} catch (_) {}
					*/

					if(threads != null && Math.max(...[threads.hack, threads.grow, threads.weak]) == 0) {
						continue;
					}

					if(threads == null) {
						// Hack available money down to offset
						let hackThreads = ns.hackAnalyzeThreads(target, tgt.moneyAvailable - moneyOffset);
						if(hackThreads < 1)
							continue;  // Skip sub-threshold targets

						// Calculate hack effect & weaken threads required to cancel it
						let hackSec = ns.hackAnalyzeSecurity(hackThreads, target);
						let weakEffect = ns.weakenAnalyze(1, srv.cpuCores);
						let baseSec = ns.getServerSecurityLevel(target);
						let weakThreads = (baseSec + hackSec) / weakEffect;

						/*
						let check = ns.weakenAnalyze(weakThreads, srv.cpuCores);
						if(check != baseSec + hackSec)
							ns.tprint(`Weaken calculation error: ${check} != ${baseSec + hackSec}`);
						*/

						let growThreads = 0;
						if(!drainMode) {
							// Calculate grow threads to maximize money
							growThreads = ns.growthAnalyze(target, tgt.moneyMax / moneyOffset);

							// Add more weaken threads to compensate for growth
							let growSec = ns.growthAnalyzeSecurity(growThreads, target, srv.cpuCores);
							weakThreads += growSec / weakEffect;
						}

						threads = {
							hack: Math.floor(hackThreads),
							weak: Math.floor(weakThreads),
							grow: drainMode ? 0 : Math.floor(growThreads)
						};
						engagements[target] = threads;
						ns.print(`Calculated new engagement for "${server}" -> "${target}": ${Object.entries(threads)}`);
					}
					else {
						ns.print(`Loaded existing engagement for "${server}" -> "${target}": ${Object.entries(threads)}`);
					}

					// Attempt to run task on server pointed at target
					let minCost = 1e100;
					for(let [task, threadCount] of Object.entries(threads)) {
						if(task == 'time' || threadCount == 0)
							continue;

						let script = `${task}.bin.js`;
						let scriptRam = ns.getScriptRam(script, server);
						let freeRam = getFreeRam(ns, server, reserved);
						let actualThreads = Math.min(Math.floor(freeRam / scriptRam), threadCount);
						minCost = Math.min(minCost, scriptRam);

						if(actualThreads == 0) {
							break;
						}

						ns.print(
							`Executing script "${script}" on server "${server}" with ${actualThreads} threads targeting ` +
							`"${tgt.hostname}" (${tgt.hackDifficulty.toFixed(2)}, ${ns.nFormat(tgt.moneyAvailable, '0.0a')})`
						);
						ns.exec(script, server, actualThreads, tgt.hostname);
						threads[task] -= actualThreads;

						if(!anyTargets)
							anyTargets = true;
					}

					threads.time = performance.now() + maxRuntime;  // TODO: tweak?
					if(getFreeRam(ns, server, reserved) < minCost) {
						break;  // Not enough RAM left for any more threads, move to next host server
					}
				}

				await ns.sleep(100);
			}

			if(!anyTargets) {
				ns.print('No valid targets found, engagements reset!');
				engagements = {};
			}
		}

		//if(maxExp[0] > 0)
			//ns.print(`Best target: ${maxExp[0]}/${maxExp[1]} @ ${maxExp[2]}`);

		await ns.sleep(10000);
	}
}
