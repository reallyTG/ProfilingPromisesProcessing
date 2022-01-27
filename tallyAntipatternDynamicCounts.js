// Take some antipattern stats file, and results files.
// First, map out antipattern occurences.
// Then, go through results files and get locations.

const fs = require('fs');
const yargs = require('yargs');

const argv = yargs(process.argv).argv
let antipatternFile = argv.antipatterns;
let pathTo = argv.pathTo;
let resFile = argv.resFile;
let outFile = argv.outFile;

const antipatternStats = fs.readFileSync(antipatternFile, 'utf-8');

let patternTally = [];
for (let line of antipatternStats.split('\n')) {
    let splitLine = line.substring(1, line.length - 1).split(' ');
    // pattern3     (row start) (col start) (row end) (col end) /path/to/file
    if (splitLine.length === 6) {
        let newFile = splitLine[5];
        if (newFile.substr(0, pathTo.length) === pathTo) {
            newFile = newFile.substr(pathTo.length);
        }
        patternTally.push({
            pattern: splitLine[0],
            start: parseInt(splitLine[1]),
            end: parseInt(splitLine[3]),
            file: newFile
        });
    } // else it's not in the correct format.
}

// Now, go through results files.
// Call this once per result file.
let results = JSON.parse(fs.readFileSync(resFile, 'utf-8'));
let promises = results.promises;
let dynInstancesOfAntipatterns = {};
for (let pID of Object.keys(promises)) {
    let promise = promises[pID];
    // See if this promise is contained in a pattern.
    for (let ap of patternTally) {
        if (ap.file === promise.file &&
            ap.start <= promise.startLine &&
            ap.end >= promise.endLine) {
            let indexer = ap.pattern + " " + ap.file + ":" + ap.start + ":" + ap.end;
            if (!dynInstancesOfAntipatterns[indexer]) {
                dynInstancesOfAntipatterns[indexer] = 0;
            } 
            dynInstancesOfAntipatterns[indexer] += 1;
        }
    }
}
