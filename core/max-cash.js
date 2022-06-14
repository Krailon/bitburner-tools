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
const enumerateServers = async ns => {
	const servers = [];
	const queue = ['home'];
	let hostname, neighbors;

	while(queue.length > 0) {
		hostname = queue.shift();
		neighbors = ns.scan(hostname);

		for(let neighbor of neighbors) {
			if(neighbor == 'home') continue;
			if(servers.indexOf(neighbor) == -1 && queue.indexOf(neighbor) == -1) {
				queue.push(neighbor);
			}
		}

		// Include home
		servers.push(hostname);
		await ns.sleep(100);
	}

	return servers;
};

/**
 * @param {NS} ns
 * @param {string} target
 */
const serverConnect = async (ns, target) => {
	if(typeof target != 'string')
		throw `"${target}" is not a valid target`;

	const paths = [[target]];
	while(true) {
		let path = paths.pop();
		let last = path.slice(0, 1)[0];
		let neighbours = ns.scan(last);

		ns.print(`[serverConnect()] path=${path}, last=${last}, neighbours=${neighbours}`);  // Debug

		for(let adjacent of neighbours) {
			if(path.indexOf(adjacent) > -1) continue;

			let srv = ns.getServer(adjacent);
			if(srv.backdoorInstalled) {
				 for(let server of [adjacent, ...path])
				 	ns.singularity.connect(server);
				 return;
			}
			else {
				paths.push([adjacent, ...path]);
			}
		}

		await ns.sleep(250);
	}
};

/**
 * @param {NS} ns
 * @param {String} hostname
 * @param {Number} reserved
 */
const getFreeRam = (ns, hostname, reserved=0) => {
	return ns.getServerMaxRam(hostname) - ns.getServerUsedRam(hostname) - (hostname == 'home' ? reserved : 0);
};

/**
 * @param {NS} ns
 * @param {string} script
 */
const haveScript = (ns, script) => {
	return ns.fileExists(script, 'home');
};

/** @param {Server} server */
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
	ns.clearLog();
	suppressLogs(ns);

	const reserved = 10;
	const moneyOffset = 0;
	const growRate = 0.5;  // Percentage of max money delta to grow
	const drainMode = ns.args.indexOf('drain') > -1;
	let engagements = {};

	while(true) {
		const player = ns.getPlayer();
		let servers = await enumerateServers(ns);
		ns.print('Starting round @ ' + (new Date()).toLocaleTimeString());

		for(let server of servers) {
			if(server == 'darkweb') continue;  // Skip darkweb
			let srv = ns.getServer(server);

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
				if(ns.singularity) {
					await serverConnect(ns, server);
					await ns.singularity.installBackdoor();
				}
				else {
					// Signal BO if backdooring needed
					await ns.writePort(1, server);
				}
			}

			if(srv.maxRam == 0) {
				continue;  // Skip useless host servers
			}

			let anyTargets = false;
			for(let target of servers) {
				if(target == 'home' || target == 'darkweb') continue;
				let tgt = ns.getServer(target);

				await ns.sleep(200);
				if(!tgt.purchasedByPlayer && tgt.hasAdminRights && tgt.requiredHackingSkill <= player.hacking && tgt.moneyAvailable >= moneyOffset && tgt.moneyMax > 0) {
					let hackTime = ns.getHackTime(target);
					let maxRuntime = Math.max(...[hackTime, ns.getGrowTime(target), ns.getWeakenTime(target)]);
					let threads = engagements[target] || null;

					if(threads != null && Math.max(...[threads.hack, threads.grow, threads.weak]) == 0) {
						//ns.print(`Skipping target "${target}" with complete engagement`);
						continue;
					}

					// Seed scripts
					for(let act of ['hack', 'weak', 'grow']) {
						let script = `${act}.bin.js`;
						if(!ns.fileExists(script, server))
							await ns.scp(script, 'home', server);
					}

					if(threads == null) {
						// Hack available money down to offset
						let hackThreads = (tgt.moneyAvailable > moneyOffset) ? ns.hackAnalyzeThreads(target, tgt.moneyAvailable - moneyOffset) : 0;
						if(hackThreads < 0) {
							ns.print(
								`Error: calculated -1 hack threads for target "${target}" ($${ns.nFormat(tgt.moneyAvailable, '0.0a')}, 
								$${ns.nFormat(moneyOffset, '0.0a')}, ${tgt.hackDifficulty})`
							);
							continue;
						}
						else if(hackThreads == Infinity) {
							ns.print(
								`Warning: calculated infinite threads for server "${target}" with $${ns.nFormat(tgt.moneyAvailable, '0.0a')} 
								($${ns.nFormat(moneyOffset, '0.0a')}, ${tgt.hackDifficulty})`
							);
							hackThreads = 0;
						}

						if(hackThreads < 1) {
							ns.print(`Skipping sub-threshold target "${target}"`);
							continue;  // Skip sub-threshold targets
						}

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
						if(!drainMode && tgt.moneyAvailable < tgt.moneyMax) {
							let growTarget = (tgt.moneyMax - tgt.moneyAvailable) * growRate;

							// Calculate grow threads to maximize money
							growThreads = ns.growthAnalyze(target, growTarget / tgt.moneyAvailable);

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
						ns.print(`Calculated new engagement for "${server}" -> "${target}": hack=${threads['hack']}, weak=${threads['weak']}, grow=${threads['grow']}`);
					}
					else {
						ns.print(`Loaded existing engagement for "${server}" -> "${target}": hack=${threads['hack']}, weak=${threads['weak']}, grow=${threads['grow']}`);
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

						if(actualThreads <= 0) {
							break;
						}

						ns.print(
							`Executing script "${script}" on server "${server}" with ${actualThreads} threads targeting ` +
							`"${tgt.hostname}" (${tgt.hackDifficulty.toFixed(2)}, ${ns.nFormat(tgt.moneyAvailable, '0.0a')})`
						);
						ns.exec(script, server, actualThreads, tgt.hostname);
						threads[task] -= actualThreads;
						anyTargets = true;
					}

					threads.time = performance.now() + maxRuntime;  // TODO: tweak?
					if(getFreeRam(ns, server, reserved) < minCost) {
						break;  // Not enough RAM left for any more threads, move to next host server
					}
				}
			}

			if(!anyTargets) {
				engagements = {};
			}

			await ns.sleep(1000);
		}

		await ns.sleep(3000);
	}
}
