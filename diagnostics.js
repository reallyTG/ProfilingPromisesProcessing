
// Read the file.
import * as fs from 'fs';

let myArgs = process.argv.slice(2);
let diagnoseMe = fs.readFileSync(myArgs[0], 'utf-8');

let results = [];

let objects = diagnoseMe.split('\n');


objects.forEach((o) => {
        if (!o.length > 0) {
		// The last (empty) line makes it in.
	} else { 
		results.push(JSON.parse(o));
	}
});

let asyncIDs = [];
let asyncIDsTriggerMap = {};
results.forEach((r) => {
	asyncIDs.push(r.asyncId);
	if (asyncIDsTriggerMap[r.triggerAsyncId])
		asyncIDsTriggerMap[r.triggerAsyncId].push(r.asyncId);
	else
		asyncIDsTriggerMap[r.triggerAsyncId] = [r.asyncId];
});

console.log(asyncIDsTriggerMap);

// Get frequencies.
let freqs = {};
let problematicAsyncIDs = [];
asyncIDs.forEach(aid => {
	if (freqs[aid]) {
		freqs[aid] = freqs[aid] + 1;
		problematicAsyncIDs.push(aid);
	} else {
		freqs[aid] = 1;
	}
});

// Log 'problems'. Are these actually problems?
problematicAsyncIDs.forEach(paid => {
	let problems = [];
	results.forEach(r => { if (r.asyncId === paid) { problems.push(r); } });
	console.log('problematic asyncID ' + paid + ': ');
        console.log(problems);
});

// There were no cycles, just duplicate entries.


