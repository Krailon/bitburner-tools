const PERIOD = 10000;  // 10s
const CHAOS_MIN = 1;
const CHAOS_MAX = 10;
const CHAOS_WEIGHT = 1
const COMMS_WEIGHT = 1
const POP_WEIGHT = 1

/**
 * @param {number} chaos
 * @param {number} comms
 * @param {number} pop */
function scoreCity(chaos, comms, pop) {
	return (-chaos * CHAOS_WEIGHT) +
	       (comms * COMMS_WEIGHT) +
		     ((pop - 1e9) * POP_WEIGHT);
}

/** @param {NS} ns */
function test(ns) {
	let cities = ['Sector-12', 'Aevum', 'Volhaven', 'Chongqing', 'New Tokyo', 'Ishima']
	let currentCity = ns.bladeburner.getCity();
	let best = {
		city: null,
		score: 0
	};

	// Find best city
	for (let city of cities) {
		let chaos = ns.bladeburner.getCityChaos(city);
		let comms = ns.bladeburner.getCityCommunities(city);
		let pop = ns.bladeburner.getCityEstimatedPopulation(city);

		// Avoid communitylessness, high-chaos, low population
		if (comms > 0 && chaos < 50 && pop > 1e9) {
			let score = scoreCity(chaos, comms, pop);

			if (score > best.score) {
				best.city = city;
				best.score = score;
			}
		}
	}

	ns.print(`Best city: ${best.city} @ ${best.score} (currently in ${currentCity})`)
}

/**
 * @param {NS} ns 
 * @param {Document} doc */
function findSkills(ns, doc) {
	let skillButtons = new Map();
	let chain = doc.evaluate("//*[contains(@class, 'css-dbtlw8')]", document, null, XPathResult.ANY_TYPE, null);
	let elem = chain.iterateNext();

	while (elem != null) {
		if (elem.getAttribute('aria-label') == null) {
			let skillName = elem.parentElement.children[0].innerText;
			skillButtons.set(skillName, elem);
			//ns.print(`Found skill button "${skillName}"`);
		}

		elem = chain.iterateNext();
	}

	/*
	if (skillButtons.size > 0) {
		ns.print(`Found ${skillButtons.length} skill buttons`);
	}
	else {
		ns.print('Failed to find any elements');
	}
	*/

	return skillButtons;
}

async function skillTest() {
	const doc = parent['document'];
	const targetSkill = (ns.args.length > 0) ? ns.args[0] : 'Hands of Midas';
	const levelCount = (ns.args.length > 1) ? parseInt(ns.args[1]) : 1;
	let skills = findSkills(ns, doc);

	if (skills.size == 0) {
		// TODO: consider automatically navigating to Bladeburner skill page
		ns.print('Error: failed to find any Bladeburner skills (are you on the Bladeburner skill page?)');
		return;
	}
	else if (!skills.has(targetSkill)) {
		ns.print(`Error: "${targetSkill}" is not a valid Bladeburner skill`);
		return;
	}

	ns.print(`Leveling up skill "${targetSkill}" by ${levelCount} levels...`);
	for (let i = 0; i < levelCount; i++) {
		skills.get(targetSkill).click()
		await ns.asleep(50);
	}
	ns.print('Done!');
}

/** @param {NS} ns */
function bladeburn(ns) {
	let BB = ns.bladeburner;
	let currentAction = BB.getCurrentAction();

	if (currentAction && currentAction.type == 'Black Operations') {
		// Wait patiently for Black Op to finish
		return;
	}

	// Check Block Ops
	let rank = BB.getRank();
	let nextBop = BB.getNextBlackOp();
	if (rank >= nextBop.rank) {
		let [success, _] = BB.getActionEstimatedSuccessChance('BlackOps', nextBop.name);

		if (success == 1) {
			// Always do the available Black Op if it has 100% success probability
			BB.startAction('BlackOps', nextBop.name);
			return;
		}
	}

	let bestAction = [0, null, null];
	let maxUncertainty = 0;

	// Check operations
	for (let operation of BB.getOperationNames()) {
		let remaining = BB.getActionCountRemaining('Operations', operation);

		if (remaining > 1) {
			let [minSuccess, maxSuccess] = BB.getActionEstimatedSuccessChance('Operations', operation);

			if ((maxSuccess - minSuccess) > maxUncertainty) {
				maxUncertainty = maxSuccess - minSuccess;
			}

			if (minSuccess > bestAction[0]) {
				bestAction = [minSuccess, 'Operations', operation];
			}
		}
	}

	// Check contracts
	for (let contract of BB.getContractNames()) {
		let remaining = BB.getActionCountRemaining('Contracts', contract);

		if (remaining > 1) {
			let [minSuccess, maxSuccess] = BB.getActionEstimatedSuccessChance('Contracts', contract);

			if ((maxSuccess - minSuccess) > maxUncertainty) {
				maxUncertainty = maxSuccess - minSuccess;
			}

			if (minSuccess > bestAction[0]) {
				bestAction = [minSuccess, 'Contracts', contract];
			}
		}
	}

	// Perform Field Analysis if success estimates are uncertain
	if (maxUncertainty > 0) {
		bestAction = [1, 'General', 'Field Analysis'];
	}

	// TODO: handle low success probability by leveling up Evasive Systems & Reaper skills

	//ns.print(`Best Action: ${bestAction} (current action: ${curAction ? curAction.name : 'None'})`);  // Debug
	if (!currentAction || (currentAction.name != bestAction[2])) {
		let ok = BB.startAction(bestAction[1], bestAction[2]);
		// TODO: handle failure?
	}
}

/** @param {NS} ns*/
function manageSkills(ns) {
	let BB = ns.bladeburner;
	let sp = BB.getSkillPoints();

	// Focus on Overclock until maxed...
	let overclockLevel = BB.getSkillLevel("Overclock");
	if (overclockLevel < 90) {
		//ns.print(`Trying to upgrade Overclock skill to level ${overclockLevel + 1}`);  // Debug
		let upCost = BB.getSkillUpgradeCost("Overclock");
		if (upCost < sp) {
			BB.upgradeSkill("Overclock");
		}

		return;
	}

	// ...then pour into Hyperdrive up to some level
	let hyperdriveLevel = BB.getSkillLevel("Hyperdrive");
	if (hyperdriveLevel < 50) {
		//ns.print(`Trying to upgrade Hyperdrive skill to level ${hyperdriveLevel + 1}`);  // Debug
		let upCost = BB.getSkillUpgradeCost("Hyperdrive");
		if (upCost < sp) {
			BB.upgradeSkill("Hyperdrive");
		}

		return;
	}

	// Find cheapest skill to upgrade
	let cheapestSkill = [9e9, null];
	for (let skill of BB.getSkillNames()) {
		let upCost = BB.getSkillUpgradeCost(skill);

		if (upCost < cheapestSkill[0]) {
			cheapestSkill = [upCost, skill];
		}
	}

	//ns.print(`Cheapest Skill: ${cheapestSkill}`);  // Debug

	if (cheapestSkill[0] <= sp) {
		BB.upgradeSkill(cheapestSkill[1]);
	}
}

/** @param {NS} ns */
function manageChaos(ns) {
	let BB = ns.bladeburner;
	let chaos = BB.getCityChaos(BB.getCity().toString());
	let currentAction = BB.getCurrentAction();

	if (chaos > CHAOS_MAX) {
		if (!currentAction || currentAction.name != 'Diplomacy') {
			let ok = BB.startAction('General', 'Diplomacy');
			// TODO: handle failure
		}

		return false;  // Prevent normal actions
	}
	else if (currentAction && currentAction.name == 'Diplomacy' && chaos > CHAOS_MIN) {
		return false;  // Prevent normal actions during Diplomacy until chaos hits 0
	}

	return true;
}

/** @param {NS} ns */
export async function main(ns) {
	ns.disableLog('sleep');
	ns.clearLog();

	ns.print('Starting Bladeburn bot...');
	while (true) {
		let [curStam, maxStam] = ns.bladeburner.getStamina();
		let stamRatio = curStam / maxStam;
		let currentAction = ns.bladeburner.getCurrentAction();
		let healing = currentAction && (currentAction.name == 'Hyperbolic Regeneration Chamber');
		let hp = ns.getPlayer().hp;

		// TODO: task sleeves if available

		// Decide whether to heal/regen
		if (!healing && ((stamRatio < 0.5) || (hp.current < hp.max))) {
			// Rest until stamina full
			//ns.print('Resting...');
			let ok = ns.bladeburner.startAction('General', 'Hyperbolic Regeneration Chamber');

			if (!ok) {
				ns.print('Error: failed to start Bladeburner regen');
			}
		}
		else if ((healing && (stamRatio == 1) && (hp.current == hp.max)) || !healing) {
			// Stamina maxed & HP max, start bladeburning!
			if (manageChaos(ns)) {
				bladeburn(ns);
			}
		}

		manageSkills(ns);

		await ns.sleep(PERIOD);
	}
}
