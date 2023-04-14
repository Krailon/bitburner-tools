/** @param {NS} ns */
const suppressLogs = ns => {
	ns.disableLog('sleep');
	ns.disableLog('scan');
	ns.disableLog('exec');
	ns.disableLog('scp');
	ns.disableLog('getServerMaxRam');
	ns.disableLog('getServerUsedRam');
	ns.disableLog('getServerSecurityLevel');
	ns.disableLog('singularity.getDarkwebProgramCost');
	ns.disableLog('singularity.purchaseProgram');
	ns.clearLog();
};

/** @param {NS} ns */
const enumerateServers = async ns => {
	const servers = [];
	const queue = ['home'];
	let hostname, neighbors;

	while (queue.length > 0) {
		hostname = queue.shift();
		neighbors = ns.scan(hostname);
		//ns.print(`[findServers()] Processing server "${hostname}" with ${neighbors.length} neighbors...`);

		for (let neighbor of neighbors) {
			if (neighbor == 'home') continue;
			if (servers.indexOf(neighbor) == -1 && queue.indexOf(neighbor) == -1) {
				queue.push(neighbor);
			}
		}

		// Include home
		servers.push(hostname);
		await ns.sleep(100);
	}

	//ns.print(`[findServers()] Found ${servers.length} servers`);
	return servers;
};

/**
 * @param {NS} ns
 * @param {string} target
 */
const serverConnect = async (ns, target) => {
	if (typeof target != 'string')
		throw `"${target}" is not a valid target`;

	const paths = [[target]];
	while (true) {
		let path = paths.pop();
		let last = path.slice(0, 1)[0];
		let neighbours = ns.scan(last);

		//ns.print(`[serverConnect()] path=${path}, last=${last}, neighbours=${neighbours}`);  // Debug
		for (let adjacent of neighbours) {
			if (path.indexOf(adjacent) > -1) continue;

			let srv = ns.getServer(adjacent);
			if (srv.backdoorInstalled) {
				for (let server of [adjacent, ...path])
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
const getFreeRam = (ns, hostname, reserved = 0) => {
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
	for (let entry of Object.entries(server)) {
		if (entry[0].indexOf('PortOpen') > -1 && entry[1])
			count++;
	}

	return count;
};

/** @param {NS} ns */
export async function main(ns) {
	ns.clearLog();
	suppressLogs(ns);

	const reserved = 20;
	const growRate = 1;  // Percentage of max money delta to grow
	const maxMoneyThreshold = 1e7;
	const drainMode = ns.args.indexOf('drain') > -1;
	const nowin = ns.args.indexOf('nowin') > -1;
	const exploits = ['BruteSSH.exe', 'FTPCrack.exe', 'relaySMTP.exe', 'HTTPWorm.exe', 'SQLInject.exe']

	var moneyOffset = 100;
	let engagements = {};

	if (drainMode) {
		ns.print('Drain mode activated! All servers will be drained of all their money without replenishment.');
		moneyOffset = 0;
	}

	while (true) {
		const player = ns.getPlayer();
		let servers = await enumerateServers(ns);
		//let maxExp = [0, 1, null];
		ns.print('Starting round @ ' + (new Date()).toLocaleTimeString());

		// Auto-buy TOR router if affordable
		if (!ns.hasTorRouter()) {
			if (player.money >= 200000) {
				ns.singularity.purchaseTor();
			}
		}
		else {
			// Auto-buy exploits if affordable
			for (let prog of ns.singularity.getDarkwebPrograms()) {
				if (exploits.indexOf(prog) == -1) continue;

				let cost = ns.singularity.getDarkwebProgramCost(prog);
				if (cost > 0 && player.money >= cost) {
					ns.singularity.purchaseProgram(prog);
					ns.print(`Purchased exploit ${prog} for $${ns.formatNumber(cost)}`);
				}
			}
		}

		for (let server of servers) {
			if (server == 'darkweb') continue;  // Skip darkweb
			let srv = ns.getServer(server);
			//ns.print(`Processing host server "${server}"`);

			if (!srv.hasAdminRights) {
				//ns.print(`Attempting to r00t server "${server}"`);

				// Not r00ted, attempt to open ports
				if (haveScript(ns, 'BruteSSH.exe') && !srv.sshPortOpen) {
					ns.brutessh(server);
					srv.sshPortOpen = true;
				}
				if (haveScript(ns, 'FTPCrack.exe') && !srv.ftpPortOpen) {
					ns.ftpcrack(server);
					srv.ftpPortOpen = true;
				}
				if (haveScript(ns, 'relaySMTP.exe') && !srv.smtpPortOpen) {
					ns.relaysmtp(server);
					srv.smtpPortOpen = true;
				}
				if (haveScript(ns, 'HTTPWorm.exe') && !srv.httpPortOpen) {
					ns.httpworm(server);
					srv.httpPortOpen = true;
				}
				if (haveScript(ns, 'SQLInject.exe') && !srv.sqlPortOpen) {
					ns.sqlinject(server);
					srv.sqlPortOpen = true;
				}

				// Nuke if enough ports are open
				let openPorts = getOpenPorts(srv);
				if (openPorts >= srv.numOpenPortsRequired) {
					ns.nuke(server);
					ns.print(`R00ted ${server}!`);
				}
				else {
					//ns.print(`Skipping host "${server}" since it can't be nuked yet`);
					continue;  // Move on to next host server if can't nuke
				}
			}

			if (!srv.backdoorInstalled && server != 'home' && !srv.purchasedByPlayer && player.skills.hacking >= srv.requiredHackingSkill) {
				// Signal BO if backdooring needed
				//ns.tprint(`Server "${server}" needs backdooring!`);
				await serverConnect(ns, server);
				await ns.singularity.installBackdoor();
				ns.singularity.connect('home');
			}

			if (srv.maxRam == 0) {
				//ns.print(`Skipping useless host "${server}"`);
				continue;  // Skip useless host servers
			}

			let anyTargets = false;
			for (let target of servers) {
				let tgt = ns.getServer(target);
				if (target == 'home' || target == 'darkweb' || tgt.serverGrowth > 100 || (nowin && target == 'w0r1d_d43m0n')) continue;

				await ns.sleep(100);
				if (!tgt.purchasedByPlayer && tgt.hasAdminRights && tgt.requiredHackingSkill <= player.skills.hacking && tgt.moneyAvailable >= moneyOffset && tgt.moneyMax > maxMoneyThreshold) {
					let hackTime = ns.formulas.hacking.hackTime(tgt, player);  //ns.getHackTime(target);
					let maxRuntime = Math.max(...[
						hackTime,
						ns.formulas.hacking.growTime(tgt, player),  //ns.getGrowTime(target),
						ns.formulas.hacking.weakenTime(tgt, player)  //ns.getWeakenTime(target)
					]);
					let engagement = engagements[target] || null;
					let threads = {};

					//ns.print(`Processing target "${target}"`);
					/*
					try {
						let exp = ns.formulas.hacking.hackExp(tgt, ns.getPlayer());
						if((exp / hackTime) > (maxExp[0] / maxExp[1]))
							maxExp = [exp, hackTime, target];
					} catch (_) {}
					*/

					if (engagement != null && Math.max(...[engagement.preWeak, engagement.hack, engagement.midWeak, engagement.grow, engagement.postWeak]) == 0) {
						//ns.print(`Skipping target "${target}" with complete engagement`);
						continue;
					}

					// Seed scripts
					for (let act of ['hack', 'weak', 'grow']) {
						let script = `${act}.bin.js`;
						if (!ns.fileExists(script, server))
							ns.scp(script, server, 'home');
					}

					let weakEffect = ns.weakenAnalyze(1, srv.cpuCores);
					let growTarget = (tgt.moneyMax * growRate) - Math.max(moneyOffset, 1);
					if (engagement == null) {
						// Hack available money down to offset
						let hackThreads = tgt.moneyAvailable >= moneyOffset ? ns.hackAnalyzeThreads(target, tgt.moneyAvailable) : 0; //(tgt.moneyAvailable > moneyOffset) ? ns.hackAnalyzeThreads(target, tgt.moneyAvailable - moneyOffset) : 0;
						if (hackThreads < 0) {
							ns.print(`[WARN] calculated negative hack threads for target "${target}" ($${ns.formatNumber(tgt.moneyAvailable, 1)}, $${ns.formatNumber(moneyOffset, 1)}, ${tgt.hackDifficulty})`);
							continue;
						}
						else if (hackThreads == Infinity) {
							ns.print(`[WARN] calculated infinite threads for server "${target}" with $${ns.formatNumber(tgt.moneyAvailable, 1)} ($${ns.formatNumber(moneyOffset, 1)}, ${tgt.hackDifficulty})`);
							hackThreads = 0;
						}
						/*
						if(hackThreads < 1) {
							ns.print(`Skipping sub-threshold target "${target}"`);
							continue;  // Skip sub-threshold targets
						}
						*/

						// Calculate hack effect & weaken threads required to cancel it
						let baseSec = ns.getServerSecurityLevel(target);
						let hackSec = ns.hackAnalyzeSecurity(hackThreads, target);
						let preWeakThreads = baseSec / weakEffect;
						let midWeakThreads = 0;
						let postWeakThreads = 0;
						let growThreads = 0;
						let growSec = 0;

						/*
						let check = ns.weakenAnalyze(weakThreads, srv.cpuCores);
						if(check != baseSec + hackSec)
							ns.tprint(`Weaken calculation error: ${check} != ${baseSec + hackSec}`);
						*/

						if (!drainMode) {
							// Debug
							//ns.print(`[${target}] money=$${ns.nFormat(tgt.moneyAvailable, '0.0a')}, max=${ns.nFormat(tgt.moneyMax, '0.0a')}, growTarget=$${ns.nFormat(growTarget, '0.0a')}, growRatio=${growTarget / tgt.moneyAvailable}`);

							midWeakThreads = hackSec / weakEffect;

							// Calculate grow threads to maximize money
							growThreads = ns.formulas.hacking.growThreads(tgt, player, growTarget, srv.cpuCores);  //ns.growthAnalyze(target, growTarget, srv.cpuCores);  // Grow happens after hacks, which reduce money to offset, so growth is ultimately relative to offset
							//growThreads = ns.growthAnalyze(target, growTarget, srv.cpuCores);

							// Add more weaken threads to compensate for growth
							growSec = ns.growthAnalyzeSecurity(growThreads, target, srv.cpuCores);
							//ns.print(`[DBG] growthAnalyzeSecurity(${growThreads}, ${target}, ${srv.cpuCores}) = ${growSec}`);  // Debug
							postWeakThreads = growSec / weakEffect;
						}

						threads = {
							preWeak: Math.ceil(preWeakThreads),
							hack: Math.ceil(hackThreads),
							midWeak: Math.ceil(midWeakThreads),
							grow: Math.ceil(growThreads),
							postWeak: Math.ceil(postWeakThreads)
						};
						engagements[target] = {
							preWeak: baseSec,
							hack: hackThreads > 0 ? tgt.moneyAvailable - moneyOffset : 0,
							midWeak: drainMode ? 0 : hackSec,
							grow: drainMode ? 0 : growTarget,
							postWeak: drainMode ? 0 : growSec
						};

						ns.print(`New engagement "${server}" -> "${target}": preWeak=${threads['preWeak']}, hack=${threads['hack']}, midWeak=${threads['midWeak']}, grow=${threads['grow']}, postWeak=${threads['postWeak']} ($${ns.formatNumber(tgt.moneyAvailable, 1)}/$${ns.formatNumber(growTarget, 1)})`);
					}
					else {
						ns.print(`Loading engagement "${server}" -> "${target}": preWeak=${engagement['preWeak'].toFixed(2)}, hack=$${ns.formatNumber(engagement['hack'], 1)}, midWeak=${engagement['midWeak'].toFixed(2)}, grow=$${ns.formatNumber(engagement['grow'], 1)}, postWeak=${engagement['postWeak'].toFixed(2)}`);  // Debug
						if (engagement['hack'] > tgt.moneyAvailable) {
							engagement['hack'] = tgt.moneyAvailable - 1;
						}
	
						let hackThreads = (engagement['hack'] > 0 && tgt.moneyAvailable > 0) ? ns.hackAnalyzeThreads(target, engagement['hack']) : 0;
						if(hackThreads == -1) {
							ns.print(`[WARN] Got -1 hack threads ($${ns.formatNumber(engagement["hack"], 1)}, $${ns.formatNumber(tgt.moneyAvailable, 1)})`);
							hackThreads = 0;
						}
						else if(hackThreads == 0 && engagement['hack'] > 0) {
							// Fix nasty desync issue when target has no money but hack engagement is already set
							ns.print(`[WARN] Fixed money desync for target ${target} ($${ns.formatNumber(engagement['hack'], 1)}, $${ns.formatNumber(tgt.moneyAvailable, 1)})`);
							engagement['hack'] = tgt.moneyAvailable - 1;
						}
						else if (hackThreads == Infinity) {
							// Not exactly sure what causes this but probably 0 available money
							ns.print(`[WARN] Fixed infinite hack threads for target ${target} ($${ns.formatNumber(engagement['hack'], 1)}, $${ns.formatNumber(tgt.moneyAvailable, 1)})`);
							engagement['hack'] = 0;
							hackThreads = 0;
						}

						let growThreads = (engagement['grow'] > 0) ? Math.ceil(ns.formulas.hacking.growThreads(tgt, player, engagement['grow'], srv.cpuCores)) : 0;
						if (growThreads == 0 && engagement['grow'] > 0) {
							ns.print(`[WARN] Fixed zero grow threads for target ${target} ($${ns.formatNumber(engagement['grow'], 1)}, $${tgt.hackDifficulty})`);
							engagement['grow'] = 0;
						}

						threads = {
							preWeak: Math.ceil(engagement['preWeak'] / weakEffect),
							hack: Math.ceil(hackThreads),
							midWeak: Math.ceil(engagement['midWeak'] / weakEffect),
							grow: growThreads,  // ns.growthAnalyze(target, engagement['grow'])
							postWeak: Math.ceil(engagement['postWeak'] / weakEffect)
						};
						ns.print(`Calculated threads "${server}" -> "${target}": preWeak=${threads['preWeak']}, hack=${threads['hack']}, midWeak=${threads['midWeak']}, grow=${threads['grow']}, postWeak=${threads['postWeak']}`);					}

					// Attempt to run task on server pointed at target
					anyTargets = true;
					let minCost = 1e100;
					for (let [task, threadCount] of Object.entries(threads)) {
						let superTask = (task.indexOf('Weak') > -1) ? 'weak' : task;
						if (task == 'time' || threadCount == 0) {
							continue;
						}
						else if (task == 'grow' && tgt.moneyAvailable == tgt.moneyMax) {
							ns.print(`Discarding ${threads["grow"]} grow threads since target "${target}" is at max money ($${ns.formatNumber(tgt.moneyMax, 1)})`);
							engagements[target]['grow'] = 0;  // Prevent wasted grow cycles due to bad calculation
							continue;
						}
						else if (superTask == 'weak' && tgt.hackDifficulty == 0) {
							ns.print(`Discarding ${threads[task]} grow threads since target "${target}" is at base security`);
							engagements[target][task] = 0;
							continue;
						}

						let script = `${superTask}.bin.js`;
						let scriptRam = ns.getScriptRam(script, server);
						let freeRam = getFreeRam(ns, server, reserved);
						let actualThreads = Math.min(Math.floor(freeRam / scriptRam), threadCount);
						minCost = Math.min(minCost, scriptRam);

						if (actualThreads <= 0) {
							//ns.print(`Ran out of RAM while tasking "${server}" -> "${target}" (${task})`);
							break;
						}

						// Update engagement with calculated effect
						if (task == 'hack') {
							let delta = (actualThreads / threadCount) * engagements[target]['hack'];
							engagements[target]['hack'] = Math.max(engagements[target]['hack'] - delta, 0);
							//ns.print(`[DBG] Updated hack task "${server}" -> "${target}" by ${delta}`);
						}
						else if (superTask == 'weak') {
							let delta = ns.weakenAnalyze(actualThreads, srv.cpuCores);
							engagements[target][task] = Math.max(engagements[target][task] - delta, 0);
							//ns.print(`[DBG] Updated ${task} task "${server}" -> "${target}" by ${delta}`);
						}
						else {
							let delta = (actualThreads / threadCount) * growTarget;
							engagements[target]['grow'] = Math.max(engagements[target]['grow'] - delta, 0);
							//ns.print(`[DBG] Updated grow task "${server}" -> "${target}" by ${delta}`);
						}

						ns.print(
							`Executing script "${script}" on server "${server}" with ${actualThreads} threads targeting ` +
							`"${tgt.hostname}" (${tgt.hackDifficulty.toFixed(2)}, $${ns.formatNumber(tgt.moneyAvailable, 1)}/$${ns.formatNumber(tgt.moneyMax, 1)})`
						);
						ns.exec(script, server, actualThreads, tgt.hostname);
						threads[task] -= actualThreads;
						break;  // Each task should be completed before moving on to the next one

						//if (actualThreads != threadCount) {
							// Obviously no RAM left
							//ns.print(`Breaking task loop since only ${actualThreads}/${threadCount} threads could be run`);
							//break;
						//}
					}

					threads.time = performance.now() + maxRuntime;  // TODO: tweak?
					if (getFreeRam(ns, server, reserved) < minCost) {
						//ns.print(`Host server "${server}" fully tasked, moving on`);
						break;  // Not enough RAM left for any more threads, move to next host server
					}
				}
				else if (target.indexOf('cluster') == -1) {
					//ns.print(`Skipping unsuitable target "${target}" (${tgt.requiredHackingSkill}HS, $${ns.nFormat(tgt.moneyAvailable, '0.0a')} / $${ns.nFormat(tgt.moneyMax, '0.0a')})`);
				}
			}

			if (!anyTargets && Object.keys(engagements).length > 0) {
				//ns.print('No valid targets found, engagements reset!');
				engagements = {};
			}

			await ns.sleep(1000);
		}

		//if(maxExp[0] > 0)
		//ns.print(`Best target: ${maxExp[0]}/${maxExp[1]} @ ${maxExp[2]}`);

		await ns.sleep(5000);
	}
}
